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
    const store = new BoardStore(new Y.Doc(), "u1");
    store.add(text("b", 2), text("a", 1), text("m", 9, "map"));
    expect(store.getSnapshot().map((i) => i.id)).toEqual(["m", "a", "b"]);

    store.update({ a: { x: 10, text: "ciao" } });
    expect(store.get("a")).toMatchObject({ x: 10, text: "ciao", kind: "text" });

    store.remove(["b"]);
    expect(store.getSnapshot().map((i) => i.id)).toEqual(["m", "a"]);
  });

  it("returns the same snapshot until something changes", () => {
    const store = new BoardStore(new Y.Doc(), "u1");
    store.add(text("a"));
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    store.update({ a: { x: 1 } });
    expect(store.getSnapshot()).not.toBe(first);
  });

  it("ignores invalid items written by other clients", () => {
    const doc = new Y.Doc();
    const store = new BoardStore(doc, "u1");
    doc.getMap("items").set("bad", { id: "bad", kind: "text" });
    doc.getMap("items").set("mismatch", text("other"));
    expect(store.getSnapshot()).toEqual([]);
  });

  it("brings items to front and sends them to back within their layer", () => {
    const store = new BoardStore(new Y.Doc(), "u1");
    store.add(text("a", 1), text("b", 2), text("c", 3), text("m", 1, "map"));
    store.bringToFront(["a"]);
    expect(store.getSnapshot().map((i) => i.id)).toEqual(["m", "b", "c", "a"]);
    store.sendToBack(["c", "a"]);
    expect(store.getSnapshot().map((i) => i.id)).toEqual(["m", "c", "a", "b"]);
  });

  it("undoes each action separately, even when they happen in quick succession", () => {
    const store = new BoardStore(new Y.Doc(), "u1");
    store.add(text("a"));
    store.add(text("b"));
    store.remove(["a"]);
    store.undo();
    expect(store.getSnapshot().map((i) => i.id)).toEqual(["a", "b"]);
    store.undo();
    expect(store.getSnapshot().map((i) => i.id)).toEqual(["a"]);
  });

  it("shares grid settings and undoes them like any other action", () => {
    const [docA, docB] = linkedDocs();
    const gm = new BoardStore(docA, "gm");
    const player = new BoardStore(docB, "player");
    expect(player.getGrid().enabled).toBe(false);

    gm.updateGrid({ enabled: true, size: 50 });
    expect(player.getGrid()).toMatchObject({ enabled: true, size: 50 });

    gm.updateGrid({ size: 2 }); // non valida: ignorata
    expect(player.getGrid().size).toBe(50);

    gm.undo();
    expect(player.getGrid().enabled).toBe(false);
  });

  it("syncs between clients and undoes only local changes", () => {
    const [docA, docB] = linkedDocs();
    const alice = new BoardStore(docA, "alice");
    const bob = new BoardStore(docB, "bob");

    alice.add(text("a"));
    bob.add(text("b"));
    expect(bob.getSnapshot().map((i) => i.id)).toEqual(["a", "b"]);

    alice.undo();
    expect(bob.getSnapshot().map((i) => i.id)).toEqual(["b"]);
    expect(alice.canRedo()).toBe(true);
    alice.redo();
    expect(bob.getSnapshot().map((i) => i.id)).toEqual(["a", "b"]);
  });
});
