import { roomDocumentName } from "@scryboard/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { isAllowedPlayerItemChange } from "../src/collab/guard";
import { connect, createRoom, startTestServer, type TestServer, tempDatabasePath } from "./helpers";

const base = { x: 0, y: 0, rotation: 0, z: 0, createdBy: "u" };
const token = (id: string, extra: Record<string, unknown> = {}) => ({
  ...base,
  id,
  kind: "token",
  layer: "token",
  locked: false,
  name: "Goblin",
  color: "#46a758",
  assetId: null,
  size: 1,
  ...extra,
});
const mapImage = (id: string) => ({
  ...base,
  id,
  kind: "image",
  layer: "map",
  locked: false,
  assetId: "a.png",
  width: 10,
  height: 10,
});

describe("isAllowedPlayerItemChange", () => {
  it("allows players to manage unlocked items outside the map layer", () => {
    expect(isAllowedPlayerItemChange("add", "t", undefined, token("t"))).toBe(true);
    expect(isAllowedPlayerItemChange("update", "t", token("t"), token("t", { x: 5 }))).toBe(true);
    expect(isAllowedPlayerItemChange("delete", "t", token("t"), undefined)).toBe(true);
  });

  it("rejects map items, locked items, invalid data and kind changes", () => {
    expect(isAllowedPlayerItemChange("add", "m", undefined, mapImage("m"))).toBe(false);
    const river = {
      ...base,
      id: "r",
      kind: "path",
      layer: "paths",
      locked: false,
      style: "river",
      points: [0, 0, 50, 100, 0, 50],
    };
    expect(isAllowedPlayerItemChange("add", "r", undefined, river)).toBe(false);
    expect(isAllowedPlayerItemChange("delete", "r", river, undefined)).toBe(false);
    expect(isAllowedPlayerItemChange("delete", "m", mapImage("m"), undefined)).toBe(false);
    expect(isAllowedPlayerItemChange("update", "t", token("t", { locked: true }), token("t"))).toBe(
      false,
    );
    expect(isAllowedPlayerItemChange("update", "t", token("t"), token("t", { locked: true }))).toBe(
      false,
    );
    expect(isAllowedPlayerItemChange("add", "t", undefined, { id: "t", kind: "token" })).toBe(
      false,
    );
    expect(isAllowedPlayerItemChange("add", "x", undefined, token("t"))).toBe(false);
    expect(
      isAllowedPlayerItemChange("update", "t", token("t"), {
        ...base,
        id: "t",
        kind: "text",
        layer: "draw",
        locked: false,
        text: "x",
        fontSize: 10,
        color: "#000000",
        width: null,
      }),
    ).toBe(false);
  });
});

describe("public document guard", () => {
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

  async function table() {
    const room = await createRoom(server);
    const name = roomDocumentName(room.id, "public");
    const gm = await connect(server, name, room.gmToken);
    const player = await connect(server, name, "player");
    if (gm.status !== "synced" || player.status !== "synced") throw new Error("not synced");
    return {
      gm: gm.doc,
      player: player.doc,
      close: () => {
        gm.provider.destroy();
        player.provider.destroy();
      },
    };
  }

  const settle = () => new Promise((r) => setTimeout(r, 150));
  const items = (doc: Y.Doc) => doc.getMap<Record<string, unknown>>("items");

  it("keeps valid player changes", async () => {
    const { gm, player, close } = await table();
    items(player).set("t", token("t"));
    await settle();
    expect(items(gm).get("t")).toMatchObject({ name: "Goblin" });
    expect(items(player).get("t")).toMatchObject({ name: "Goblin" });
    close();
  });

  it("reverts players adding or removing map items", async () => {
    const { gm, player, close } = await table();
    items(player).set("m", mapImage("m"));
    await settle();
    expect(items(gm).has("m")).toBe(false);
    expect(items(player).has("m")).toBe(false);

    items(gm).set("m2", mapImage("m2"));
    await settle();
    items(player).delete("m2");
    await settle();
    expect(items(gm).has("m2")).toBe(true);
    expect(items(player).has("m2")).toBe(true);
    close();
  });

  it("reverts players moving locked items", async () => {
    const { gm, player, close } = await table();
    items(gm).set("t", token("t", { locked: true }));
    await settle();
    items(player).set("t", token("t", { locked: true, x: 500 }));
    await settle();
    expect(items(gm).get("t")).toMatchObject({ x: 0 });
    expect(items(player).get("t")).toMatchObject({ x: 0 });
    close();
  });

  it("reserves grid settings, fog and terrain to the GM", async () => {
    const { gm, player, close } = await table();
    player.getMap("terrain").set("t", {
      id: "t",
      seq: 1,
      biome: "grass",
      mode: "paint",
      shape: "brush",
      points: [0, 0, 10, 10],
      width: 50,
    });
    player.getMap("settings").set("grid", { enabled: true, size: 50, offsetX: 0, offsetY: 0 });
    player.getMap("fog").set("f", { id: "f", seq: 1, mode: "cover", shape: "all", points: [] });
    await settle();
    expect(gm.getMap("settings").has("grid")).toBe(false);
    expect(player.getMap("fog").has("f")).toBe(false);
    expect(gm.getMap("terrain").has("t")).toBe(false);

    gm.getMap("fog").set("f", { id: "f", seq: 1, mode: "cover", shape: "all", points: [] });
    await settle();
    player.getMap("fog").delete("f");
    await settle();
    expect(player.getMap("fog").has("f")).toBe(true);
    close();
  });
});
