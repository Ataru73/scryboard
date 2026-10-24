import type { BoardItem, TextItem } from "@scryboard/shared";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { BoardStore } from "./store";

function text(id: string, z = 0, layer: BoardItem["layer"] = "draw"): TextItem {
  return {
    id,
    layer,
    z,
    kind: "text",
    x: 0,
    y: 0,
    rotation: 0,
    locked: false,
    createdBy: "u1",
    text: id,
    fontSize: 20,
    color: "#000000",
    width: null,
  };
}

/** Collega due documenti come farebbe il server. */
function linkedDocs(): [Y.Doc, Y.Doc] {
  const a = new Y.Doc();
  const b = new Y.Doc();
  a.on("update", (u: Uint8Array) => Y.applyUpdate(b, u, "remote"));
  b.on("update", (u: Uint8Array) => Y.applyUpdate(a, u, "remote"));
  return [a, b];
}

describe("BoardStore", () => {
  it("adds, updates and removes items, keeping a sorted snapshot", () => {
    const store = new BoardStore(new Y.Doc(), null, "u1");
    store.add([text("b", 2), text("a", 1), text("m", 9, "map")]);
    expect(store.getSnapshot().map((i) => i.id)).toEqual(["m", "a", "b"]);

    store.update({ a: { x: 10, text: "ciao" } });
    expect(store.get("a")).toMatchObject({ x: 10, text: "ciao", kind: "text" });

    store.remove(["b"]);
    expect(store.getSnapshot().map((i) => i.id)).toEqual(["m", "a"]);
  });

  it("returns the same snapshot until something changes", () => {
    const store = new BoardStore(new Y.Doc(), null, "u1");
    store.add([text("a")]);
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    store.update({ a: { x: 1 } });
    expect(store.getSnapshot()).not.toBe(first);
  });

  it("ignores invalid items written by other clients", () => {
    const doc = new Y.Doc();
    const store = new BoardStore(doc, null, "u1");
    doc.getMap("items").set("bad", { id: "bad", kind: "text" });
    doc.getMap("items").set("mismatch", text("other"));
    expect(store.getSnapshot()).toEqual([]);
  });

  it("brings items to front and sends them to back within their layer", () => {
    const store = new BoardStore(new Y.Doc(), null, "u1");
    store.add([text("a", 1), text("b", 2), text("c", 3), text("m", 1, "map")]);
    store.bringToFront(["a"]);
    expect(store.getSnapshot().map((i) => i.id)).toEqual(["m", "b", "c", "a"]);
    store.sendToBack(["c", "a"]);
    expect(store.getSnapshot().map((i) => i.id)).toEqual(["m", "c", "a", "b"]);
  });

  it("undoes each action separately, even when they happen in quick succession", () => {
    const store = new BoardStore(new Y.Doc(), null, "u1");
    store.add([text("a")]);
    store.add([text("b")]);
    store.remove(["a"]);
    store.undo();
    expect(store.getSnapshot().map((i) => i.id)).toEqual(["a", "b"]);
    store.undo();
    expect(store.getSnapshot().map((i) => i.id)).toEqual(["a"]);
  });

  it("shares grid settings and undoes them like any other action", () => {
    const [docA, docB] = linkedDocs();
    const gm = new BoardStore(docA, null, "gm");
    const player = new BoardStore(docB, null, "player");
    expect(player.getGrid().enabled).toBe(false);

    gm.updateGrid({ enabled: true, size: 50 });
    expect(player.getGrid()).toMatchObject({ enabled: true, size: 50 });

    gm.updateGrid({ size: 2 }); // non valida: ignorata
    expect(player.getGrid().size).toBe(50);

    gm.undo();
    expect(player.getGrid().enabled).toBe(false);
  });

  it("hides and reveals items by moving them between documents, as one undo step", () => {
    const publicDoc = new Y.Doc();
    const gmDoc = new Y.Doc();
    const store = new BoardStore(publicDoc, gmDoc, "gm");
    store.add([text("a"), text("b")]);
    store.setHidden(["a"], true);

    expect(store.isHidden("a")).toBe(true);
    expect(publicDoc.getMap("items").has("a")).toBe(false);
    expect(gmDoc.getMap("items").has("a")).toBe(true);
    expect(store.getSnapshot().map((i) => i.id)).toEqual(["a", "b"]);

    // Le modifiche a un oggetto nascosto restano nel documento del GM.
    store.update({ a: { x: 42 } });
    expect(gmDoc.getMap("items").get("a")).toMatchObject({ x: 42 });
    expect(publicDoc.getMap("items").has("a")).toBe(false);

    store.undo(); // annulla lo spostamento
    store.undo(); // annulla il nascondimento
    expect(store.isHidden("a")).toBe(false);
    expect(publicDoc.getMap("items").get("a")).toMatchObject({ x: 0 });
    expect(gmDoc.getMap("items").has("a")).toBe(false);

    store.redo();
    expect(store.isHidden("a")).toBe(true);
  });

  it("creates hidden items directly in the GM document", () => {
    const publicDoc = new Y.Doc();
    const store = new BoardStore(publicDoc, new Y.Doc(), "gm");
    store.add([text("secret")], { hidden: true });
    expect(store.isHidden("secret")).toBe(true);
    expect(publicDoc.getMap("items").size).toBe(0);
  });

  it("ignores hiding without a GM document", () => {
    const store = new BoardStore(new Y.Doc(), null, "player");
    store.add([text("a")]);
    store.setHidden(["a"], true);
    expect(store.isHidden("a")).toBe(false);
    expect(store.canHide).toBe(false);
  });

  it("applies fog operations in order and clears them", () => {
    const store = new BoardStore(new Y.Doc(), null, "gm");
    store.addFog({ mode: "cover", shape: "all", points: [] });
    store.addFog({ mode: "reveal", shape: "rect", points: [0, 0, 10, 10] });
    expect(store.getFog().map((op) => op.mode)).toEqual(["cover", "reveal"]);
    store.clearFog();
    expect(store.getFog()).toEqual([]);
    store.undo();
    expect(store.getFog()).toHaveLength(2);
  });

  it("shares lighting settings with undo", () => {
    const [docA, docB] = linkedDocs();
    const gm = new BoardStore(docA, null, "gm");
    const player = new BoardStore(docB, null, "p");
    expect(player.getLighting()).toEqual({ enabled: false, ambient: "day", explorationEpoch: 0 });
    gm.updateLighting({ enabled: true, ambient: "night" });
    expect(player.getLighting()).toMatchObject({ enabled: true, ambient: "night" });
    const snapshot = player.getLighting();
    gm.updateGrid({ size: 50 });
    expect(player.getLighting()).toBe(snapshot);
    gm.undo();
    gm.undo();
    expect(player.getLighting().enabled).toBe(false);
  });

  it("stores terrain strokes in order, with undo", () => {
    const store = new BoardStore(new Y.Doc(), null, "gm");
    store.addTerrain({
      biome: "grass",
      mode: "paint",
      shape: "brush",
      points: [0, 0, 10, 10],
      width: 40,
    });
    store.addTerrain({
      biome: "sand",
      mode: "paint",
      shape: "region",
      points: [0, 0, 50, 0, 25, 40],
    });
    expect(store.getTerrain().map((op) => op.biome)).toEqual(["grass", "sand"]);
    store.undo();
    expect(store.getTerrain()).toHaveLength(1);
    store.clearTerrain();
    expect(store.getTerrain()).toEqual([]);
    store.undo();
    expect(store.getTerrain()).toHaveLength(1);
  });

  it("syncs walls and treats generated batches and door changes as single actions", () => {
    const [docA, docB] = linkedDocs();
    const gm = new BoardStore(docA, null, "gm");
    const player = new BoardStore(docB, null, "player");
    const created = gm.addWalls([
      { kind: "wall", points: [0, 0, 70, 0, 70, 70] },
      { kind: "door", points: [70, 70, 0, 70], door: "closed" },
    ]);
    const door = created[1];
    expect(created).toHaveLength(2);
    expect(door?.kind).toBe("door");
    expect(player.getWalls()).toHaveLength(2);
    expect(player.getWall(door?.id ?? "")).toMatchObject({ kind: "door", door: "closed" });

    gm.undo();
    expect(player.getWalls()).toEqual([]);
    gm.redo();
    expect(player.getWalls()).toHaveLength(2);
    if (!door) throw new Error("porta mancante");
    gm.updateWall(door.id, { door: "open", points: [70, 70, 0, 70] });
    expect(player.getWall(door.id)).toMatchObject({ kind: "door", door: "open" });
    gm.undo();
    expect(player.getWall(door.id)).toMatchObject({ door: "closed" });

    gm.removeWalls(created.map((wall) => wall.id));
    expect(player.getWalls()).toEqual([]);
    gm.undo();
    expect(player.getWalls()).toHaveLength(2);
  });

  it("ignores invalid walls written by other clients", () => {
    const doc = new Y.Doc();
    const store = new BoardStore(doc, null, "gm");
    doc.getMap("walls").set("bad", { id: "bad", kind: "wall", points: [0, 0, 1] });
    doc.getMap("walls").set("mismatch", {
      id: "other",
      kind: "wall",
      points: [0, 0, 10, 10],
    });
    expect(store.getWalls()).toEqual([]);
  });

  it("syncs between clients and undoes only local changes", () => {
    const [docA, docB] = linkedDocs();
    const alice = new BoardStore(docA, null, "alice");
    const bob = new BoardStore(docB, null, "bob");

    alice.add([text("a")]);
    bob.add([text("b")]);
    expect(bob.getSnapshot().map((i) => i.id)).toEqual(["a", "b"]);

    alice.undo();
    expect(bob.getSnapshot().map((i) => i.id)).toEqual(["b"]);
    expect(alice.canRedo()).toBe(true);
    alice.redo();
    expect(bob.getSnapshot().map((i) => i.id)).toEqual(["a", "b"]);
  });
});
