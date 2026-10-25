import {
  ACTIVE_SCENE_KEY,
  ITEMS_MAP,
  META_MAP,
  metaDocumentName,
  roomDocumentName,
  type Scene,
  type ScenesResponse,
} from "@scryboard/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, createRoom, startTestServer, type TestServer, tempDatabasePath } from "./helpers";

const text = (id: string) => ({
  id,
  kind: "text",
  layer: "draw",
  x: 0,
  y: 0,
  rotation: 0,
  z: 0,
  locked: false,
  createdBy: "gm",
  text: id,
  fontSize: 20,
  color: "#000000",
  width: null,
});

describe("scenes", () => {
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

  const api = (
    roomId: string,
    token: string | null,
    path: string,
    method = "GET",
    body?: unknown,
  ) =>
    fetch(`${server.baseUrl}/api/rooms/${roomId}/scenes${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const createScene = async (roomId: string, token: string, name: string) =>
    (await (await api(roomId, token, "", "POST", { name })).json()) as Scene;

  it("starts with one scene on the original document names", async () => {
    const room = await createRoom(server);
    const list = (await (await api(room.id, room.gmToken, "")).json()) as ScenesResponse;
    expect(list).toEqual({ active: "main", scenes: [{ id: "main", name: "Scena 1" }] });
    const player = await connect(server, roomDocumentName(room.id, "public"), "player");
    expect(player.status).toBe("synced");
    if (player.status === "synced") player.provider.destroy();
  });

  it("keeps players out of scenes that are not active, until the GM moves them", async () => {
    const room = await createRoom(server);
    const dungeon = await createScene(room.id, room.gmToken, "Dungeon");
    const publicName = roomDocumentName(room.id, "public", dungeon.id);

    expect((await connect(server, publicName, "player")).status).toBe("denied");
    const gm = await connect(server, publicName, room.gmToken);
    expect(gm.status).toBe("synced");
    if (gm.status !== "synced") throw new Error("gm not synced");
    gm.doc.getMap(ITEMS_MAP).set("t1", text("t1"));

    const meta = await connect(server, metaDocumentName(room.id), "player");
    if (meta.status !== "synced") throw new Error("meta not synced");
    expect(meta.doc.getMap(META_MAP).get(ACTIVE_SCENE_KEY)).toBe("main");

    const oldPlayer = await connect(server, roomDocumentName(room.id, "public"), "player");
    expect(oldPlayer.status).toBe("synced");

    const move = await api(room.id, room.gmToken, `/${dungeon.id}/activate`, "POST");
    expect(move.status).toBe(200);
    await new Promise((r) => setTimeout(r, 200));

    expect(meta.doc.getMap(META_MAP).get(ACTIVE_SCENE_KEY)).toBe(dungeon.id);
    const arrived = await connect(server, publicName, "player");
    expect(arrived.status).toBe("synced");
    if (arrived.status === "synced") {
      expect(arrived.doc.getMap(ITEMS_MAP).has("t1")).toBe(true);
      arrived.provider.destroy();
    }
    expect((await connect(server, roomDocumentName(room.id, "public"), "player")).status).toBe(
      "denied",
    );
    // Il GM può sempre tornare indietro a preparare la vecchia scena.
    const back = await connect(server, roomDocumentName(room.id, "public"), room.gmToken);
    expect(back.status).toBe("synced");
    for (const r of [gm, meta, oldPlayer, back]) if (r.status === "synced") r.provider.destroy();
  });

  it("denies unknown scenes, even to the GM, and the GM document to players", async () => {
    const room = await createRoom(server);
    const ghost = roomDocumentName(room.id, "public", "abcdef012345");
    expect((await connect(server, ghost, room.gmToken)).status).toBe("denied");
    const dungeon = await createScene(room.id, room.gmToken, "Dungeon");
    const gmDoc = roomDocumentName(room.id, "gm", dungeon.id);
    expect((await connect(server, gmDoc, "player")).status).toBe("denied");
    const gm = await connect(server, gmDoc, room.gmToken);
    expect(gm.status).toBe("synced");
    if (gm.status === "synced") gm.provider.destroy();
  });

  it("does not let players or strangers manage scenes", async () => {
    const room = await createRoom(server);
    expect((await api(room.id, null, "")).status).toBe(403);
    expect((await api(room.id, "player", "", "POST", { name: "x" })).status).toBe(403);
    expect((await api(room.id, room.gmToken, "", "POST", { name: "  " })).status).toBe(400);
    expect((await api("doesnotexist1", room.gmToken, "")).status).toBe(404);
  });

  it("renames, duplicates and deletes scenes, with sensible limits", async () => {
    const room = await createRoom(server);
    const source = await connect(server, roomDocumentName(room.id, "public"), room.gmToken);
    if (source.status !== "synced") throw new Error("not synced");
    source.doc.getMap(ITEMS_MAP).set("t1", text("t1"));
    await new Promise((r) => setTimeout(r, 100));

    const copy = (await (
      await api(room.id, room.gmToken, "/main/duplicate", "POST", { name: "Copia" })
    ).json()) as Scene;
    const copied = await connect(
      server,
      roomDocumentName(room.id, "public", copy.id),
      room.gmToken,
    );
    if (copied.status !== "synced") throw new Error("copy not synced");
    expect(copied.doc.getMap(ITEMS_MAP).has("t1")).toBe(true);

    expect(
      (await api(room.id, room.gmToken, `/${copy.id}`, "PATCH", { name: "Taverna" })).status,
    ).toBe(200);
    const list = (await (await api(room.id, room.gmToken, "")).json()) as ScenesResponse;
    expect(list.scenes.map((s) => s.name)).toEqual(["Scena 1", "Taverna"]);

    // Non si cancella la scena dei giocatori, né una scena inesistente.
    expect((await api(room.id, room.gmToken, "/main", "DELETE")).status).toBe(400);
    expect((await api(room.id, room.gmToken, "/abcdef012345", "DELETE")).status).toBe(400);
    expect((await api(room.id, room.gmToken, `/${copy.id}`, "DELETE")).status).toBe(200);
    expect(
      ((await (await api(room.id, room.gmToken, "")).json()) as ScenesResponse).scenes,
    ).toHaveLength(1);
    expect(
      (await connect(server, roomDocumentName(room.id, "public", copy.id), room.gmToken)).status,
    ).toBe("denied");
    source.provider.destroy();
    copied.provider.destroy();
  });
});
