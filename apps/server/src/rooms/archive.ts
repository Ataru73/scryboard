import type { Hocuspocus } from "@hocuspocus/server";
import {
  ARCHIVE_FORMAT,
  ARCHIVE_VERSION,
  type ArchiveManifest,
  ASSET_ID_PATTERN,
  archiveAssetPath,
  archiveManifestSchema,
  archiveScenePath,
  boardItemSchema,
  type CreateRoomResponse,
  FOG_MAP,
  fogOpSchema,
  gridSettingsSchema,
  ITEMS_MAP,
  lightingSettingsSchema,
  MAX_ARCHIVE_BYTES,
  MAX_VIDEO_BYTES,
  roomDocumentName,
  SETTINGS_MAP,
  TERRAIN_MAP,
  terrainOpSchema,
  turnSettingsSchema,
  WALLS_MAP,
  wallSchema,
} from "@scryboard/shared";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import * as Y from "yjs";
import type { AssetAccess } from "../assets/access";
import { type AssetStore, UnsupportedAssetError } from "../assets/store";
import type { ConnectionContext } from "../collab/hocuspocus";
import type { SceneService } from "./scenes";
import type { RoomService } from "./service";

export class ArchiveError extends Error {}

/** Limiti all'estrazione: lo zip dichiara le dimensioni, qui si rifiutano gli eccessi. */
const MAX_DOC_BYTES = 10 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_UNZIPPED_BYTES = 150 * 1024 * 1024;
const MAX_FILES = 500;

const ENTRY_PATH =
  /^(?:manifest\.json|scenes\/\d{1,2}\/(?:public|gm)\.ydoc|assets\/[0-9a-f]{64}\.(?:png|jpg|webp|gif|webm|mp4))$/;

/** Esportazione e importazione di una stanza in un archivio `.scryboard`. */
export class ArchiveService {
  constructor(
    private readonly collab: Hocuspocus<ConnectionContext>,
    private readonly rooms: RoomService,
    private readonly scenes: SceneService,
    private readonly assets: AssetStore,
    private readonly access: AssetAccess,
  ) {}

  private async docState(roomId: string, sceneId: string, scope: "public" | "gm") {
    const connection = await this.collab.openDirectConnection(
      roomDocumentName(roomId, scope, sceneId),
      { roomId, role: "gm" },
    );
    let state: Uint8Array = new Uint8Array();
    try {
      await connection.transact((doc) => {
        state = Y.encodeStateAsUpdate(doc);
      });
    } finally {
      await connection.disconnect();
    }
    return state;
  }

  async export(roomId: string): Promise<{ name: string; data: Uint8Array }> {
    const room = this.rooms.get(roomId);
    if (!room) throw new ArchiveError("Stanza non trovata.");
    const { active, scenes } = this.scenes.list(roomId);
    const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
    const assetIds = new Set<string>();
    for (const [index, scene] of scenes.entries()) {
      for (const scope of ["public", "gm"] as const) {
        const state = await this.docState(roomId, scene.id, scope);
        files[archiveScenePath(index, scope)] = state;
        const doc = new Y.Doc();
        Y.applyUpdate(doc, state);
        for (const item of doc.getMap<unknown>(ITEMS_MAP).values()) {
          const id = (item as { assetId?: unknown } | null)?.assetId;
          if (typeof id === "string" && ASSET_ID_PATTERN.test(id)) assetIds.add(id);
        }
      }
    }
    let size = 0;
    for (const assetId of assetIds) {
      const asset = await this.assets.get(roomId, assetId);
      // Un'immagine citata ma mancante dal disco non blocca l'esportazione.
      if (!asset) continue;
      const data = new Uint8Array(await new Response(asset.body).arrayBuffer());
      size += data.length;
      if (size > MAX_ARCHIVE_BYTES) {
        throw new ArchiveError("La stanza è troppo grande per essere esportata (oltre 50 MB).");
      }
      files[archiveAssetPath(assetId)] = [data, { level: 0 }]; // Le immagini sono già compresse.
    }
    const manifest: ArchiveManifest = {
      format: ARCHIVE_FORMAT,
      version: ARCHIVE_VERSION,
      name: room.name,
      exportedAt: new Date().toISOString(),
      activeScene: Math.max(
        0,
        scenes.findIndex((s) => s.id === active),
      ),
      scenes: scenes.map((s) => ({ name: s.name })),
    };
    files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
    const data = zipSync(files);
    if (data.length > MAX_ARCHIVE_BYTES) {
      throw new ArchiveError("La stanza è troppo grande per essere esportata (oltre 50 MB).");
    }
    return { name: room.name, data };
  }

  /** Legge lo zip rifiutando ciò che non è previsto o che dichiara dimensioni eccessive. */
  private unpack(data: Uint8Array): Record<string, Uint8Array> {
    let count = 0;
    let total = 0;
    try {
      const files = unzipSync(data, {
        filter: (file) => {
          if (++count > MAX_FILES) {
            throw new ArchiveError("L'archivio contiene file troppo grandi o troppi file.");
          }
          if (!ENTRY_PATH.test(file.name)) return false;
          const limit =
            file.name === "manifest.json"
              ? MAX_MANIFEST_BYTES
              : file.name.startsWith("assets/")
                ? MAX_VIDEO_BYTES
                : MAX_DOC_BYTES;
          total += file.originalSize;
          if (file.originalSize > limit || total > MAX_UNZIPPED_BYTES) {
            throw new ArchiveError("L'archivio contiene file troppo grandi o troppi file.");
          }
          return true;
        },
      });

      let actualTotal = 0;
      for (const [name, content] of Object.entries(files)) {
        actualTotal += content.length;
        const limit =
          name === "manifest.json"
            ? MAX_MANIFEST_BYTES
            : name.startsWith("assets/")
              ? MAX_VIDEO_BYTES
              : MAX_DOC_BYTES;
        if (content.length > limit || actualTotal > MAX_UNZIPPED_BYTES) {
          throw new ArchiveError("L'archivio contiene file troppo grandi o troppi file.");
        }
      }

      return files;
    } catch (error) {
      if (error instanceof ArchiveError) throw error;
      throw new ArchiveError("Il file non è un archivio di Scryboard valido.");
    }
  }

  /** Copia in un documento nuovo solo ciò che supera la validazione dello schema. */
  private sanitize(state: Uint8Array, scope: "public" | "gm", assetIds: Set<string>): Uint8Array {
    const source = new Y.Doc();
    try {
      Y.applyUpdate(source, state);
    } catch {
      throw new ArchiveError("Un documento dell'archivio è danneggiato.");
    }
    const clean = new Y.Doc();
    clean.transact(() => {
      const items = clean.getMap<unknown>(ITEMS_MAP);
      for (const [key, value] of source.getMap<unknown>(ITEMS_MAP).entries()) {
        const parsed = boardItemSchema.safeParse(value);
        if (!parsed.success || parsed.data.id !== key) continue;
        items.set(key, parsed.data);
        if ("assetId" in parsed.data && parsed.data.assetId) assetIds.add(parsed.data.assetId);
      }
      if (scope !== "public") return;
      const copy = (mapName: string, valid: (value: unknown, key: string) => unknown | null) => {
        const target = clean.getMap<unknown>(mapName);
        for (const [key, value] of source.getMap<unknown>(mapName).entries()) {
          const ok = valid(value, key);
          if (ok !== null) target.set(key, ok);
        }
      };
      const byId =
        (schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } }) =>
        (value: unknown, key: string) => {
          const parsed = schema.safeParse(value);
          return parsed.success && (parsed.data as { id?: string }).id === key ? parsed.data : null;
        };
      copy(WALLS_MAP, byId(wallSchema));
      copy(FOG_MAP, byId(fogOpSchema));
      copy(TERRAIN_MAP, byId(terrainOpSchema));
      // Impostazioni: la griglia, la luce e il turno; il richiamo non appartiene alla nuova stanza.
      const settings = clean.getMap<unknown>(SETTINGS_MAP);
      const from = source.getMap<unknown>(SETTINGS_MAP);
      for (const [key, schema] of [
        ["grid", gridSettingsSchema],
        ["lighting", lightingSettingsSchema],
        ["turn", turnSettingsSchema],
      ] as const) {
        const parsed = schema.safeParse(from.get(key));
        if (parsed.success) settings.set(key, parsed.data);
      }
    });
    return Y.encodeStateAsUpdate(clean);
  }

  async import(data: Uint8Array): Promise<CreateRoomResponse> {
    if (data.length > MAX_ARCHIVE_BYTES) throw new ArchiveError("Archivio troppo grande.");
    const files = this.unpack(data);
    const manifestFile = files["manifest.json"];
    if (!manifestFile) throw new ArchiveError("Manca il manifest: non è un archivio di Scryboard.");
    let manifest: ArchiveManifest;
    try {
      manifest = archiveManifestSchema.parse(JSON.parse(strFromU8(manifestFile)));
    } catch {
      throw new ArchiveError("Archivio non riconosciuto o di una versione più recente.");
    }
    if (manifest.activeScene >= manifest.scenes.length) {
      throw new ArchiveError("Archivio non valido: scena attiva inesistente.");
    }

    // Si valida tutto prima di creare la stanza, così un archivio rovinato non lascia scarti.
    const used = new Set<string>();
    const prepared = manifest.scenes.map((_, index) => ({
      public: this.sanitize(
        files[archiveScenePath(index, "public")] ?? new Uint8Array(),
        "public",
        used,
      ),
      gm: this.sanitize(files[archiveScenePath(index, "gm")] ?? new Uint8Array(), "gm", used),
    }));

    const room = this.rooms.create(manifest.name);
    const sceneIds: string[] = [];
    for (const [index, scene] of manifest.scenes.entries()) {
      if (index === 0) {
        this.scenes.rename(room.id, "main", scene.name);
        sceneIds.push("main");
      } else {
        sceneIds.push(this.scenes.create(room.id, scene.name).id);
      }
    }
    for (const [index, sceneId] of sceneIds.entries()) {
      for (const scope of ["public", "gm"] as const) {
        const state = (prepared[index] as (typeof prepared)[number])[scope];
        const connection = await this.collab.openDirectConnection(
          roomDocumentName(room.id, scope, sceneId),
          { roomId: room.id, role: "gm" },
        );
        try {
          await connection.transact((doc) => Y.applyUpdate(doc, state));
        } finally {
          await connection.disconnect();
        }
      }
    }
    this.scenes.activate(room.id, sceneIds[manifest.activeScene] as string);

    // Immagini: l'id è l'hash del contenuto, quindi se non coincide il file non è quello dichiarato.
    for (const assetId of used) {
      const bytes = files[archiveAssetPath(assetId)];
      if (!bytes) continue;
      try {
        const stored = await this.assets.put(room.id, bytes);
        // Come se le avesse caricate il GM: restano private finché non le usa un oggetto visibile.
        if (stored === assetId) this.access.recordUpload(room.id, stored, true);
      } catch (error) {
        if (!(error instanceof UnsupportedAssetError)) throw error;
      }
    }
    return room;
  }
}
