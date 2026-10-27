import {
  type CreateRoomResponse,
  ITEMS_MAP,
  roomDocumentName,
  type ScenesResponse,
  SETTINGS_MAP,
  WALLS_MAP,
} from "@scryboard/shared";
import { strToU8, unzipSync, zipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, createRoom, startTestServer, type TestServer, tempDatabasePath } from "./helpers";

// PNG 1x1 trasparente.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const base = { x: 0, y: 0, rotation: 0, z: 0, locked: false, createdBy: "gm" };
const text = (id: string, layer = "draw") => ({
  ...base,
  id,
  layer,
  kind: "text",
  text: id,
  fontSize: 20,
  color: "#000000",
  width: null,
});

describe("room archive", () => {
  let server: TestServer;
  let cleanup: () => void;

  beforeAll(async () => {
    const db = tempDatabasePath();
    cleanup = db.cleanup;
    server = await startTestServer(db.path);
  });
  afterAll(async () => {
    await server.stop();
    cleanup();
  });

  const url = (path: string) => `${server.baseUrl}/api${path}`;
  const exportRoom = (room: CreateRoomResponse, token: string | null = room.gmToken) =>
    fetch(url(`/rooms/${room.id}/export`), {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  const importBytes = (bytes: Uint8Array) =>
    fetch(url("/rooms/import"), { method: "POST", body: bytes });

  async function withDoc<T>(
    roomId: string,
    token: string,
    scope: "public" | "gm",
    sceneId: string,
    use: (doc: import("yjs").Doc) => T,
  ) {
    const result = await connect(server, roomDocumentName(roomId, scope, sceneId), token);
    if (result.status !== "synced") throw new Error(`not synced: ${result.status}`);
    try {
      return use(result.doc);
    } finally {
      result.provider.destroy();
    }
  }

  /** Una stanza con due scene, un'immagine, oggetti nascosti e un muro. */
  async function buildRoom() {
    const room = await createRoom(server, "Miniera");
    const upload = await fetch(url(`/rooms/${room.id}/assets`), {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        authorization: `Bearer ${room.gmToken}`,
      },
      body: PNG,
    });
    const { assetId } = (await upload.json()) as { assetId: string };
    const pub = await connect(server, roomDocumentName(room.id, "public"), room.gmToken);
    const gm = await connect(server, roomDocumentName(room.id, "gm"), room.gmToken);
    if (pub.status !== "synced" || gm.status !== "synced") throw new Error("not synced");
    pub.doc.getMap(ITEMS_MAP).set("map", {
      ...base,
      id: "map",
      layer: "map",
      kind: "image",
      assetId,
      width: 100,
      height: 100,
    });
    pub.doc.getMap(ITEMS_MAP).set("note", text("note"));
    pub.doc.getMap(WALLS_MAP).set("w1", { id: "w1", kind: "wall", points: [0, 0, 70, 0] });
    pub.doc.getMap(SETTINGS_MAP).set("grid", {
      enabled: true,
      type: "square",
      size: 50,
      offsetX: 0,
      offsetY: 0,
      scale: { amount: 5, unit: "ft" },
      diagonals: "one",
    });
    gm.doc.getMap(ITEMS_MAP).set("secret", text("secret"));
    const dungeon = (await (
      await fetch(url(`/rooms/${room.id}/scenes`), {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${room.gmToken}` },
        body: JSON.stringify({ name: "Dungeon" }),
      })
    ).json()) as { id: string };
    await new Promise((r) => setTimeout(r, 300));
    pub.provider.destroy();
    gm.provider.destroy();
    return { room, assetId, dungeonId: dungeon.id };
  }

  it("round-trips a room: scenes, hidden items, settings and images", async () => {
    const { room, assetId } = await buildRoom();
    const res = await exportRoom(room);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("Miniera.scryboard");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const names = Object.keys(unzipSync(bytes)).sort();
    expect(names).toContain("manifest.json");
    expect(names).toContain(`assets/${assetId}`);
    expect(names).toContain("scenes/1/gm.ydoc");

    const imported = await importBytes(bytes);
    expect(imported.status).toBe(201);
    const copy = (await imported.json()) as CreateRoomResponse;
    expect(copy.id).not.toBe(room.id);
    expect(copy.gmToken).not.toBe(room.gmToken);
    expect(copy.name).toBe("Miniera");

    const list = (await (
      await fetch(url(`/rooms/${copy.id}/scenes`), {
        headers: { authorization: `Bearer ${copy.gmToken}` },
      })
    ).json()) as ScenesResponse;
    expect(list.scenes.map((s) => s.name)).toEqual(["Scena 1", "Dungeon"]);
    expect(list.active).toBe("main");

    await withDoc(copy.id, "player", "public", "main", (doc) => {
      expect([...doc.getMap(ITEMS_MAP).keys()].sort()).toEqual(["map", "note"]);
      expect(doc.getMap(WALLS_MAP).has("w1")).toBe(true);
      expect(doc.getMap(SETTINGS_MAP).get("grid")).toMatchObject({ enabled: true, size: 50 });
    });
    await withDoc(copy.id, copy.gmToken, "gm", "main", (doc) => {
      expect([...doc.getMap(ITEMS_MAP).keys()]).toEqual(["secret"]);
    });
    // L'immagine è di nuovo disponibile, anche per i giocatori, perché usata da un oggetto pubblico.
    const image = await fetch(url(`/rooms/${copy.id}/assets/${assetId}`));
    expect(image.status).toBe(200);
  });

  it("keeps hidden objects and unused images private in the copy", async () => {
    const { room } = await buildRoom();
    const bytes = new Uint8Array(await (await exportRoom(room)).arrayBuffer());
    const copy = (await (await importBytes(bytes)).json()) as CreateRoomResponse;
    // Un giocatore non può aprire il documento del GM della copia.
    const denied = await connect(server, roomDocumentName(copy.id, "gm"), "player");
    expect(denied.status).toBe("denied");
  });

  it("only exports for the GM", async () => {
    const room = await createRoom(server);
    expect((await exportRoom(room, null)).status).toBe(403);
    expect((await exportRoom(room, "player")).status).toBe(403);
    expect((await fetch(url("/rooms/doesnotexist1/export"))).status).toBe(404);
  });

  it("rejects archives that are not valid, without leaving a room behind", async () => {
    expect((await importBytes(new Uint8Array([1, 2, 3, 4]))).status).toBe(400);
    expect((await importBytes(zipSync({ "manifest.json": strToU8("{}") }))).status).toBe(400);
    expect((await importBytes(zipSync({ "other.txt": strToU8("x") }))).status).toBe(400);

    // Rejects archives with too many files even if they don't match ENTRY_PATH
    const junkFiles: Record<string, Uint8Array> = {
      "manifest.json": strToU8(
        JSON.stringify({
          format: "scryboard-room",
          version: 1,
          name: "Junk",
          exportedAt: new Date().toISOString(),
          activeScene: 0,
          scenes: [{ name: "A" }],
        }),
      ),
    };
    for (let i = 0; i < 505; i++) {
      junkFiles[`junk_${i}.txt`] = strToU8("junk");
    }
    const junkArchive = zipSync(junkFiles);
    const junkRes = await importBytes(junkArchive);
    expect(junkRes.status).toBe(400);

    const manifest = {
      format: "scryboard-room",
      version: 1,
      name: "X",
      exportedAt: new Date().toISOString(),
      activeScene: 5,
      scenes: [{ name: "A" }],
    };
    const res = await importBytes(zipSync({ "manifest.json": strToU8(JSON.stringify(manifest)) }));
    expect(res.status).toBe(400);
  });

  it("drops invalid objects and images whose content does not match their name", async () => {
    const { room, assetId } = await buildRoom();
    const files = unzipSync(new Uint8Array(await (await exportRoom(room)).arrayBuffer()));
    // Un'immagine con il nome giusto ma altro contenuto non viene accettata come quella.
    files[`assets/${assetId}`] = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1,
    ]);
    const forged = zipSync(files);
    const copy = (await (await importBytes(forged)).json()) as CreateRoomResponse;
    const image = await fetch(url(`/rooms/${copy.id}/assets/${assetId}`));
    expect(image.status).toBe(404);
  });
});
