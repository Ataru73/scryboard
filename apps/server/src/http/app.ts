import {
  createRoomRequestSchema,
  DiceError,
  IMAGE_MIME_TYPES,
  type ListAssetsResponse,
  MAX_ARCHIVE_BYTES,
  MAX_ASSET_BYTES,
  MAX_VIDEO_BYTES,
  parsePlayerCredentials,
  ROOM_ID_PATTERN,
  rollRequestSchema,
  sceneNameRequestSchema,
  sendMessageRequestSchema,
  type UploadAssetResponse,
  VIDEO_MIME_TYPES,
} from "@scryboard/shared";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AssetAccess } from "../assets/access";
import { type AssetStore, detectAssetType, UnsupportedAssetError } from "../assets/store";
import { MessageError, type MessageService, type Sender } from "../collab/messages";
import type { RollService } from "../collab/rolls";
import type { SceneCollab } from "../collab/scenes";
import { ArchiveError, type ArchiveService } from "../rooms/archive";
import type { PlayerService } from "../rooms/players";
import { SceneError, type SceneService } from "../rooms/scenes";
import type { RoomService } from "../rooms/service";
import { rateLimit } from "./rateLimit";

export interface ApiOptions {
  limits: { rooms: number; uploads: number; messages: number; rolls: number };
  trustProxy: boolean;
}

const TEN_MINUTES = 10 * 60 * 1000;

/**
 * Un solo intervallo «bytes=a-b», «bytes=a-» o «bytes=-n»; `null` se l'header manca o non lo si
 * capisce (si risponde con tutto il file), «unsatisfiable» se cade fuori dal file.
 */
export function parseByteRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | "unsatisfiable" | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  if (!match || (match[1] === "" && match[2] === "")) return null;
  let start: number;
  let end: number;
  if (match[1] === "") {
    // Ultimi n byte.
    const length = Number(match[2]);
    if (length === 0) return "unsatisfiable";
    start = Math.max(0, size - length);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  return start >= size || start > end ? "unsatisfiable" : { start, end };
}

export function createApi(
  rooms: RoomService,
  assets: AssetStore,
  access: AssetAccess,
  options: ApiOptions,
  messaging: {
    messages: MessageService;
    players: PlayerService;
    rolls: RollService;
    scenes: { service: SceneService; collab: SceneCollab };
    archive: ArchiveService;
  },
): Hono {
  const api = new Hono();
  const limitRooms = rateLimit({
    max: options.limits.rooms,
    windowMs: TEN_MINUTES,
    trustProxy: options.trustProxy,
    message: "Troppe stanze create in poco tempo: riprova tra qualche minuto.",
  });
  const limitMessages = rateLimit({
    max: options.limits.messages,
    windowMs: TEN_MINUTES,
    trustProxy: options.trustProxy,
    message: "Troppi messaggi in poco tempo: riprova tra qualche minuto.",
  });
  const limitRolls = rateLimit({
    max: options.limits.rolls,
    windowMs: TEN_MINUTES,
    trustProxy: options.trustProxy,
    message: "Troppi tiri in poco tempo: riprova tra qualche minuto.",
  });
  const limitUploads = rateLimit({
    max: options.limits.uploads,
    windowMs: TEN_MINUTES,
    trustProxy: options.trustProxy,
    message: "Troppi caricamenti in poco tempo: riprova tra qualche minuto.",
  });

  const findRoom = (id: string) => (ROOM_ID_PATTERN.test(id) ? rooms.get(id) : null);
  // Il GM si identifica con il suo token nell'header Authorization.
  const isGmRequest = (roomId: string, header: string | undefined) => {
    const token = header?.match(/^Bearer (.+)$/)?.[1];
    return token !== undefined && rooms.isGmToken(roomId, token);
  };

  // Chi scrive o tira: il GM con il suo token, un giocatore con id del profilo e segreto
  // ("Player <id>:<segreto>").
  const resolveSender = (roomId: string, authorization: string | undefined, name: string) => {
    const header = authorization ?? "";
    if (isGmRequest(roomId, header)) return { kind: "gm", name } satisfies Sender;
    const credentials = parsePlayerCredentials(header.match(/^Player (.+)$/)?.[1] ?? "");
    if (
      credentials &&
      messaging.players.authenticate(roomId, credentials.profileId, credentials.secret, name)
    ) {
      return { kind: "player", profileId: credentials.profileId, name } satisfies Sender;
    }
    return null;
  };

  api.get("/health", (c) => c.json({ ok: true }));

  api.post("/rooms", limitRooms, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createRoomRequestSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "Nome della stanza non valido" }, 400);
    return c.json(rooms.create(parsed.data.name), 201);
  });

  // Esporta la stanza in un archivio .scryboard (solo GM) e ne crea una nuova da un archivio.
  api.get("/rooms/:id/export", limitUploads, async (c) => {
    const room = findRoom(c.req.param("id"));
    if (!room) return c.json({ error: "Stanza non trovata" }, 404);
    if (!isGmRequest(room.id, c.req.header("authorization"))) {
      return c.json({ error: "Solo il GM può esportare la stanza" }, 403);
    }
    try {
      const { name, data } = await messaging.archive.export(room.id);
      const ascii = name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60) || "stanza";
      return new Response(data, {
        headers: {
          "content-type": "application/octet-stream",
          "content-disposition": `attachment; filename="${ascii}.scryboard"; filename*=UTF-8''${encodeURIComponent(name)}.scryboard`,
        },
      });
    } catch (error) {
      if (error instanceof ArchiveError) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  api.post(
    "/rooms/import",
    limitRooms,
    bodyLimit({
      maxSize: MAX_ARCHIVE_BYTES,
      onError: (c) => c.json({ error: "Archivio troppo grande (max 50 MB)" }, 413),
    }),
    async (c) => {
      const data = new Uint8Array(await c.req.arrayBuffer());
      try {
        return c.json(await messaging.archive.import(data), 201);
      } catch (error) {
        if (error instanceof ArchiveError) return c.json({ error: error.message }, 400);
        throw error;
      }
    },
  );

  api.get("/rooms/:id", (c) => {
    const room = findRoom(c.req.param("id"));
    if (!room) return c.json({ error: "Stanza non trovata" }, 404);
    return c.json(room);
  });

  // Verifica un token GM senza esporre altro: usato dal client per mostrare l'interfaccia GM.
  api.post("/rooms/:id/gm-check", async (c) => {
    const body = await c.req.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token : "";
    return c.json({ valid: rooms.isGmToken(c.req.param("id"), token) });
  });

  // Il corpo della richiesta è il file stesso, non multipart.
  api.post(
    "/rooms/:id/assets",
    limitUploads,
    // Il tetto vale per i video; le immagini, più piccole, si controllano dopo averle riconosciute.
    bodyLimit({
      maxSize: MAX_VIDEO_BYTES,
      onError: (c) =>
        c.json({ error: "File troppo grande (video max 50 MB, immagini 20 MB)" }, 413),
    }),
    async (c) => {
      const room = findRoom(c.req.param("id"));
      if (!room) return c.json({ error: "Stanza non trovata" }, 404);
      const data = new Uint8Array(await c.req.arrayBuffer());
      if (data.length === 0) return c.json({ error: "File vuoto" }, 400);
      const byGm = isGmRequest(room.id, c.req.header("authorization"));
      const type = detectAssetType(data);
      if (type && type in VIDEO_MIME_TYPES && !byGm) {
        return c.json({ error: "Solo il GM può caricare video" }, 403);
      }
      if (type && type in IMAGE_MIME_TYPES && data.length > MAX_ASSET_BYTES) {
        return c.json({ error: "Immagine troppo grande (max 20 MB)" }, 413);
      }
      try {
        const assetId = await assets.put(room.id, data);
        access.recordUpload(room.id, assetId, byGm);
        return c.json({ assetId } satisfies UploadAssetResponse, 201);
      } catch (error) {
        if (error instanceof UnsupportedAssetError) {
          return c.json(
            { error: "Formato non supportato: usa PNG, JPEG, WebP, GIF, WebM o MP4" },
            415,
          );
        }
        throw error;
      }
    },
  );

  // Messaggi privati: il GM si identifica con il suo token, i giocatori con id del profilo e
  // segreto ("Player <id>:<segreto>").
  api.post("/rooms/:id/messages", limitMessages, async (c) => {
    const room = findRoom(c.req.param("id"));
    if (!room) return c.json({ error: "Stanza non trovata" }, 404);
    const parsed = sendMessageRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Messaggio non valido" }, 400);
    const sender = resolveSender(room.id, c.req.header("authorization"), parsed.data.fromName);
    if (!sender) return c.json({ error: "Non autorizzato" }, 401);
    try {
      const message = await messaging.messages.send(
        room.id,
        sender,
        parsed.data.to,
        parsed.data.text,
        parsed.data.note,
      );
      return c.json({ id: message.id }, 201);
    } catch (error) {
      if (error instanceof MessageError) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  // Tiri di dadi: li fa il server. Un tiro nascosto lo può chiedere solo il GM.
  api.post("/rooms/:id/rolls", limitRolls, async (c) => {
    const room = findRoom(c.req.param("id"));
    if (!room) return c.json({ error: "Stanza non trovata" }, 404);
    const parsed = rollRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Richiesta non valida" }, 400);
    const sender = resolveSender(room.id, c.req.header("authorization"), parsed.data.name);
    if (!sender) return c.json({ error: "Non autorizzato" }, 401);
    if (parsed.data.hidden && sender.kind !== "gm") {
      return c.json({ error: "Solo il GM può tirare di nascosto" }, 403);
    }
    try {
      const roll = await messaging.rolls.roll(
        room.id,
        sender,
        parsed.data.formula,
        !!parsed.data.hidden,
      );
      return c.json(roll, 201);
    } catch (error) {
      if (error instanceof DiceError) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  // Scene: le gestisce solo il GM. «Attiva» sposta i giocatori nella scena.
  const { service: sceneService, collab: sceneCollab } = messaging.scenes;
  const sceneRoute = async (
    c: Context,
    run: (roomId: string) => Promise<Response> | Response,
  ): Promise<Response> => {
    const room = findRoom(c.req.param("id") ?? "");
    if (!room) return c.json({ error: "Stanza non trovata" }, 404);
    if (!isGmRequest(room.id, c.req.header("authorization"))) {
      return c.json({ error: "Solo il GM può gestire le scene" }, 403);
    }
    try {
      return await run(room.id);
    } catch (error) {
      if (error instanceof SceneError) return c.json({ error: error.message }, 400);
      throw error;
    }
  };
  const nameOf = async (c: Context) =>
    sceneNameRequestSchema.safeParse(await c.req.json().catch(() => null));

  api.get("/rooms/:id/scenes", (c) => sceneRoute(c, (roomId) => c.json(sceneService.list(roomId))));
  api.post("/rooms/:id/scenes", (c) =>
    sceneRoute(c, async (roomId) => {
      const parsed = await nameOf(c);
      if (!parsed.success) return c.json({ error: "Nome non valido" }, 400);
      return c.json(sceneService.create(roomId, parsed.data.name), 201);
    }),
  );
  api.patch("/rooms/:id/scenes/:sceneId", (c) =>
    sceneRoute(c, async (roomId) => {
      const parsed = await nameOf(c);
      if (!parsed.success) return c.json({ error: "Nome non valido" }, 400);
      sceneService.rename(roomId, c.req.param("sceneId") ?? "", parsed.data.name);
      return c.json({ ok: true });
    }),
  );
  api.delete("/rooms/:id/scenes/:sceneId", (c) =>
    sceneRoute(c, (roomId) => {
      sceneService.remove(roomId, c.req.param("sceneId") ?? "");
      return c.json({ ok: true });
    }),
  );
  api.post("/rooms/:id/scenes/:sceneId/duplicate", (c) =>
    sceneRoute(c, async (roomId) => {
      const parsed = await nameOf(c);
      if (!parsed.success) return c.json({ error: "Nome non valido" }, 400);
      const sceneId = c.req.param("sceneId") ?? "";
      if (!sceneService.has(roomId, sceneId)) throw new SceneError("Scena non trovata.");
      return c.json(await sceneCollab.duplicate(roomId, sceneId, parsed.data.name), 201);
    }),
  );
  api.post("/rooms/:id/scenes/:sceneId/activate", (c) =>
    sceneRoute(c, async (roomId) => {
      await sceneCollab.activate(roomId, c.req.param("sceneId") ?? "");
      return c.json({ ok: true });
    }),
  );

  // Elenco delle immagini della stanza (cassetto «Caricati»): i giocatori vedono solo le pubbliche.
  api.get("/rooms/:id/assets", (c) => {
    const room = findRoom(c.req.param("id"));
    if (!room) return c.json({ error: "Stanza non trovata" }, 404);
    const isGm = isGmRequest(room.id, c.req.header("authorization"));
    return c.json({ assets: access.list(room.id, isGm) } satisfies ListAssetsResponse);
  });

  api.get("/rooms/:id/assets/:assetId", async (c) => {
    const roomId = c.req.param("id");
    const assetId = c.req.param("assetId");
    const allowed =
      ROOM_ID_PATTERN.test(roomId) &&
      (await access.canRead(roomId, assetId, isGmRequest(roomId, c.req.header("authorization"))));
    // Stessa risposta per "non esiste" e "non puoi vederla": non si rivela nulla.
    const asset = allowed ? await assets.get(roomId, assetId) : null;
    if (!asset) return c.json({ error: "Immagine non trovata" }, 404);
    const headers = {
      "content-type": asset.contentType,
      "accept-ranges": "bytes",
      // L'id è l'hash del contenuto: il file non cambia mai.
      // Mai in cache condivise: alcune immagini sono riservate al GM.
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    };
    // I video si guardano a pezzi (scorrimento, ripetizione): serve il supporto a «Range».
    const range = parseByteRange(c.req.header("range"), asset.size);
    if (range === "unsatisfiable") {
      await asset.body.cancel();
      return c.body(null, 416, { "content-range": `bytes */${asset.size}` });
    }
    if (range) {
      await asset.body.cancel();
      const part = await assets.get(roomId, assetId, range);
      if (!part) return c.json({ error: "Immagine non trovata" }, 404);
      return c.body(part.body, 206, {
        ...headers,
        "content-length": String(range.end - range.start + 1),
        "content-range": `bytes ${range.start}-${range.end}/${asset.size}`,
      });
    }
    return c.body(asset.body, 200, { ...headers, "content-length": String(asset.size) });
  });

  return api;
}
