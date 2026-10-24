import { roomDocumentName, WALLS_MAP } from "@scryboard/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { isAllowedPlayerItemChange, isAllowedPlayerWallChange } from "../src/collab/guard";
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
const wall = (
  id: string,
  kind: "wall" | "window" | "invisible" = "wall",
  extra: Record<string, unknown> = {},
) => ({
  id,
  kind,
  points: [0, 0, 70, 0, 70, 70],
  ...extra,
});
const door = (
  id: string,
  state: "open" | "closed" | "locked" = "closed",
  extra: Record<string, unknown> = {},
) => ({
  id,
  kind: "door",
  points: [0, 0, 70, 0],
  door: state,
  ...extra,
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

describe("isAllowedPlayerWallChange", () => {
  it("allows only actual open/closed toggles on an existing door", () => {
    const closed = door("d");
    const open = door("d", "open");
    expect(isAllowedPlayerWallChange("update", "d", closed, open)).toBe(true);
    expect(isAllowedPlayerWallChange("update", "d", open, closed)).toBe(true);
    expect(isAllowedPlayerWallChange("update", "d", closed, door("d"))).toBe(false);
    expect(isAllowedPlayerWallChange("update", "d", open, door("d", "open"))).toBe(false);
  });

  it("rejects player additions, updates and deletions of every barrier kind", () => {
    for (const kind of ["wall", "window", "invisible"] as const) {
      const before = wall("w", kind);
      expect(isAllowedPlayerWallChange("add", "w", undefined, before)).toBe(false);
      expect(isAllowedPlayerWallChange("update", "w", before, wall("w", kind))).toBe(false);
      expect(
        isAllowedPlayerWallChange(
          "update",
          "w",
          before,
          wall("w", kind, { points: [0, 0, 100, 0, 100, 100] }),
        ),
      ).toBe(false);
      expect(isAllowedPlayerWallChange("delete", "w", before, undefined)).toBe(false);
    }
  });

  it("rejects player additions and deletions of doors in every state", () => {
    for (const state of ["open", "closed", "locked"] as const) {
      const value = door("d", state);
      expect(isAllowedPlayerWallChange("add", "d", undefined, value)).toBe(false);
      expect(isAllowedPlayerWallChange("delete", "d", value, undefined)).toBe(false);
    }
  });

  it("rejects toggling a door covered by the fog", () => {
    const coverAll = [
      { id: "f", seq: 1, mode: "cover" as const, shape: "all" as const, points: [] },
    ];
    const revealDoor = [
      ...coverAll,
      {
        id: "r",
        seq: 2,
        mode: "reveal" as const,
        shape: "rect" as const,
        points: [-10, -10, 90, 20],
      },
    ];
    expect(isAllowedPlayerWallChange("update", "d", door("d"), door("d", "open"), coverAll)).toBe(
      false,
    );
    expect(isAllowedPlayerWallChange("update", "d", door("d"), door("d", "open"), revealDoor)).toBe(
      true,
    );
  });

  it("never allows transitions from or to a locked door", () => {
    const locked = door("d", "locked");
    expect(isAllowedPlayerWallChange("update", "d", locked, door("d", "open"))).toBe(false);
    expect(isAllowedPlayerWallChange("update", "d", locked, door("d"))).toBe(false);
    expect(isAllowedPlayerWallChange("update", "d", door("d"), locked)).toBe(false);
    expect(isAllowedPlayerWallChange("update", "d", door("d", "open"), locked)).toBe(false);
  });

  it("requires strict values and preserves key, id, kind and points", () => {
    const closed = door("d");
    const open = door("d", "open");
    expect(isAllowedPlayerWallChange("update", "other", closed, open)).toBe(false);
    expect(isAllowedPlayerWallChange("update", "d", { ...closed, id: "other" }, open)).toBe(false);
    expect(isAllowedPlayerWallChange("update", "d", closed, { ...open, id: "other" })).toBe(false);
    expect(isAllowedPlayerWallChange("update", "d", closed, wall("d"))).toBe(false);
    expect(isAllowedPlayerWallChange("update", "d", wall("d"), open)).toBe(false);
    expect(
      isAllowedPlayerWallChange("update", "d", closed, { ...open, points: [0, 0, 70, 1] }),
    ).toBe(false);
    expect(
      isAllowedPlayerWallChange("update", "d", closed, {
        ...open,
        points: [0, 0, 70, 0, 70, 70],
      }),
    ).toBe(false);
  });

  it("rejects malformed or non-strict old and new values", () => {
    const closed = door("d");
    const open = door("d", "open");
    expect(isAllowedPlayerWallChange("update", "d", null, open)).toBe(false);
    expect(isAllowedPlayerWallChange("update", "d", closed, null)).toBe(false);
    expect(isAllowedPlayerWallChange("update", "d", { ...closed, hidden: true }, open)).toBe(false);
    expect(isAllowedPlayerWallChange("update", "d", closed, { ...open, hidden: true })).toBe(false);
    expect(isAllowedPlayerWallChange("update", "d", closed, { ...open, door: "broken" })).toBe(
      false,
    );
    expect(isAllowedPlayerWallChange("update", "d", { ...closed, points: [0, 0] }, open)).toBe(
      false,
    );
    expect(
      isAllowedPlayerWallChange("update", "d", closed, { ...open, points: [0, 0, "70", 0] }),
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
  const walls = (doc: Y.Doc) => doc.getMap<Record<string, unknown>>(WALLS_MAP);

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

  it("keeps valid player door toggles", async () => {
    const { gm, player, close } = await table();
    walls(gm).set("d", door("d"));
    await settle();
    walls(player).set("d", door("d", "open"));
    await settle();
    expect(walls(gm).get("d")).toEqual(door("d", "open"));
    expect(walls(player).get("d")).toEqual(door("d", "open"));
    close();
  });

  it("reverts players opening locked doors", async () => {
    const { gm, player, close } = await table();
    walls(gm).set("d", door("d", "locked"));
    await settle();
    walls(player).set("d", door("d", "open"));
    await settle();
    expect(walls(gm).get("d")).toEqual(door("d", "locked"));
    expect(walls(player).get("d")).toEqual(door("d", "locked"));
    close();
  });

  it("reverts players adding or deleting barriers and doors", async () => {
    const { gm, player, close } = await table();
    const fixtures = [wall("w"), wall("win", "window"), wall("i", "invisible"), door("d")];
    for (const value of fixtures) walls(player).set(value.id, value);
    await settle();
    for (const value of fixtures) {
      expect(walls(gm).has(value.id)).toBe(false);
      expect(walls(player).has(value.id)).toBe(false);
    }

    for (const value of fixtures) walls(gm).set(value.id, value);
    await settle();
    for (const value of fixtures) walls(player).delete(value.id);
    await settle();
    for (const value of fixtures) {
      expect(walls(gm).get(value.id)).toEqual(value);
      expect(walls(player).get(value.id)).toEqual(value);
    }
    close();
  });

  it("reverts players opening a door hidden under the fog", async () => {
    const { gm, player, close } = await table();
    walls(gm).set("d", door("d"));
    gm.getMap("fog").set("f", { id: "f", seq: 1, mode: "cover", shape: "all", points: [] });
    await settle();
    walls(player).set("d", door("d", "open"));
    await settle();
    expect(walls(gm).get("d")).toEqual(door("d"));
    expect(walls(player).get("d")).toEqual(door("d"));
    close();
  });

  it("reverts geometry changes disguised as door toggles", async () => {
    const { gm, player, close } = await table();
    const original = door("d");
    walls(gm).set("d", original);
    await settle();
    walls(player).set("d", door("d", "open", { points: [0, 0, 70, 1] }));
    await settle();
    expect(walls(gm).get("d")).toEqual(original);
    expect(walls(player).get("d")).toEqual(original);
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
