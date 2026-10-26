import type { BoardItem, ConnectorItem, NoteItem, TextItem, TokenItem } from "@scryboard/shared";
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

function token(id: string): TokenItem {
  return {
    id,
    layer: "token",
    z: 0,
    kind: "token",
    x: 0,
    y: 0,
    rotation: 0,
    locked: false,
    createdBy: "u1",
    name: id,
    color: "#46a758",
    assetId: null,
    size: 1,
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

  it("keeps the turn order on tokens, so hidden ones stay out of the public document", () => {
    const [pubA, pubB] = linkedDocs();
    const gmDoc = new Y.Doc();
    const gm = new BoardStore(pubA, gmDoc, "gm");
    const player = new BoardStore(pubB, null, "player");
    gm.add([token("a"), token("b")]);
    gm.add([token("h")], { hidden: true });
    gm.setInitiative(["a", "b", "h"], 0);
    gm.setInitiative(["a"], 10);
    gm.setInitiative(["h"], 20);
    expect(gm.getInitiativeOrder().map((t) => t.id)).toEqual(["h", "a", "b"]);
    expect(player.getInitiativeOrder().map((t) => t.id)).toEqual(["a", "b"]);

    gm.advanceTurn();
    expect(player.getTurn()).toEqual({ activeId: "h", round: 1 });
    gm.advanceTurn();
    gm.advanceTurn();
    gm.advanceTurn();
    expect(player.getTurn()).toEqual({ activeId: "h", round: 2 });

    gm.setInitiative(["a", "b", "h"], null);
    gm.resetTurn();
    expect(gm.getInitiativeOrder()).toEqual([]);
    expect(player.getTurn()).toEqual({ activeId: null, round: 1 });
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

  it("obscures tokens keeping their identity only in the GM document", () => {
    const publicDoc = new Y.Doc();
    const gmDoc = new Y.Doc();
    const store = new BoardStore(publicDoc, gmDoc, "gm");
    const player = new BoardStore(publicDoc, null, "player");
    store.add([{ ...token("lich"), portrait: "skull" }]);
    store.setObscured(["lich"], true);

    expect(publicDoc.getMap("items").get("lich")).toMatchObject({
      obscured: true,
      name: "",
      portrait: null,
    });
    expect(player.get("lich")).toMatchObject({ obscured: true, name: "" });
    expect(store.get("lich")).toMatchObject({ obscured: true, name: "lich", portrait: "skull" });
    expect(store.isObscured("lich")).toBe(true);

    // Rinominarlo cambia la maschera, non il documento pubblico; spostarlo invece sì.
    store.update({ lich: { name: "Lich antico", x: 7 } });
    expect(store.get("lich")).toMatchObject({ name: "Lich antico", x: 7 });
    expect(player.get("lich")).toMatchObject({ name: "", x: 7 });

    // Anche nascosto e poi rivelato ai giocatori resta in incognito.
    store.setHidden(["lich"], true);
    store.setHidden(["lich"], false);
    expect(player.get("lich")).toMatchObject({ obscured: true, name: "" });

    store.setObscured(["lich"], false);
    expect(player.get("lich")).toMatchObject({ name: "Lich antico", portrait: "skull" });
    expect(player.get("lich")).not.toHaveProperty("obscured");
    expect(gmDoc.getMap("masks").size).toBe(0);

    store.undo();
    expect(player.get("lich")).toMatchObject({ obscured: true, name: "" });
    expect(store.get("lich")).toMatchObject({ name: "Lich antico" });
  });

  it("drops the identity of a removed obscured token", () => {
    const gmDoc = new Y.Doc();
    const store = new BoardStore(new Y.Doc(), gmDoc, "gm");
    store.add([token("a")]);
    store.setObscured(["a"], true);
    store.remove(["a"]);
    expect(gmDoc.getMap("masks").size).toBe(0);
    store.undo();
    expect(store.get("a")).toMatchObject({ name: "a", obscured: true });
  });

  it("duplicates items one cell away, numbering token copies", () => {
    const store = new BoardStore(new Y.Doc(), null, "gm");
    store.add([
      { ...token("Goblin"), initiative: 12, vision: { range: 0, darkvision: 12 } },
      text("note", 3),
    ]);
    const [first] = store.duplicate(["Goblin"]);
    const [second] = store.duplicate(["Goblin"]);
    const step = store.getGrid().size;
    expect(store.get(first as string)).toMatchObject({ name: "Goblin 2", x: step, y: step });
    expect(store.get(second as string)).toMatchObject({ name: "Goblin 3" });
    // La copia resta fuori dai turni ma, per il GM, vede come l'originale.
    expect(store.get(first as string)).not.toHaveProperty("initiative");
    expect(store.get(first as string)).toMatchObject({ vision: { darkvision: 12 } });
    // Duplicare una copia numerata riparte dal nome base.
    const [third] = store.duplicate([second as string]);
    expect(store.get(third as string)).toMatchObject({ name: "Goblin 4" });

    const [note] = store.duplicate(["note"]);
    expect(store.get(note as string)).toMatchObject({ kind: "text", z: 4 });
    store.undo();
    expect(store.get(note as string)).toBeUndefined();
  });

  it("keeps copies of hidden and obscured items hidden and obscured", () => {
    const publicDoc = new Y.Doc();
    const gmDoc = new Y.Doc();
    const store = new BoardStore(publicDoc, gmDoc, "gm");
    store.add([token("Lich"), token("Spia")]);
    store.setObscured(["Lich"], true);
    store.setHidden(["Spia"], true);
    const [lich, spia] = store.duplicate(["Lich", "Spia"]) as [string, string];
    expect(publicDoc.getMap("items").get(lich)).toMatchObject({ obscured: true, name: "" });
    expect(store.get(lich)).toMatchObject({ name: "Lich 2", obscured: true });
    expect(store.isHidden(spia)).toBe(true);
    store.undo();
    expect(gmDoc.getMap("masks").has(lich)).toBe(false);
  });

  it("duplicates for players only what a player may create", () => {
    const publicDoc = new Y.Doc();
    const gm = new BoardStore(publicDoc, new Y.Doc(), "gm");
    const player = new BoardStore(publicDoc, null, "p1");
    gm.add([{ ...token("Elfo"), owners: ["p1"] }, token("Ombra")]);
    gm.setObscured(["Ombra"], true);
    const copies = player.duplicate(["Elfo", "Ombra"], { asPlayer: true });
    expect(copies).toHaveLength(1);
    expect(player.get(copies[0] as string)).toMatchObject({ name: "Elfo 2" });
    expect(player.get(copies[0] as string)).not.toHaveProperty("owners");
  });

  it("shows an image to the players until the GM stops, outside the undo history", () => {
    const publicDoc = new Y.Doc();
    const gm = new BoardStore(publicDoc, new Y.Doc(), "gm");
    const player = new BoardStore(publicDoc, null, "p1");
    gm.showHandout("letter.png");
    const first = player.getHandout();
    expect(first).toMatchObject({ assetId: "letter.png" });
    expect(gm.canUndo()).toBe(false);
    // Mostrarla di nuovo cambia l'id: si riapre per chi l'aveva chiusa.
    gm.showHandout("letter.png");
    expect(player.getHandout()?.id).not.toBe(first?.id);
    gm.showHandout(null);
    expect(player.getHandout()).toBeNull();
  });

  it("keeps GM notes away from players until revealed", () => {
    const publicDoc = new Y.Doc();
    const gm = new BoardStore(publicDoc, new Y.Doc(), "gm");
    const player = new BoardStore(publicDoc, null, "p1");
    const note: NoteItem = {
      ...text("pin"),
      layer: "map",
      kind: "note",
      icon: "trap",
      title: "Botola",
      text: "**CD 15** Destrezza",
    };
    gm.add([note], { hidden: true });
    gm.update({ pin: { text: "**CD 12** Destrezza" } });
    expect(player.get("pin")).toBeUndefined();
    gm.setHidden(["pin"], false);
    expect(player.get("pin")).toMatchObject({ kind: "note", text: "**CD 12** Destrezza" });
  });

  it("removes the connectors of a removed item in the same undo step", () => {
    const store = new BoardStore(new Y.Doc(), null, "gm");
    const link: ConnectorItem = {
      ...text("link"),
      kind: "connector",
      from: "a",
      to: "b",
      color: "#e5484d",
      strokeWidth: 3,
      arrow: true,
      label: "fratello di",
    };
    store.add([token("a"), token("b"), link]);
    store.remove(["b"]);
    expect(store.get("link")).toBeUndefined();
    store.undo();
    expect(store.get("link")).toMatchObject({ from: "a", to: "b" });
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

  it("adds terrain and covering fog as a single undo step", () => {
    const store = new BoardStore(new Y.Doc(), null, "gm");
    store.addTerrainBatch(
      [
        { biome: "grass", mode: "paint", shape: "brush", points: [0, 0, 10, 0], width: 40 },
        { biome: "rock", mode: "paint", shape: "brush", points: [0, 50, 10, 50], width: 40 },
      ],
      [{ mode: "cover", shape: "rect", points: [0, 0, 100, 100] }],
    );
    expect(store.getTerrain().map((op) => op.biome)).toEqual(["grass", "rock"]);
    expect(store.getFog()).toHaveLength(1);
    store.undo();
    expect(store.getTerrain()).toEqual([]);
    expect(store.getFog()).toEqual([]);
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

  it("moves attached walls when the parent image moves, and deletes them when removed", () => {
    const doc = new Y.Doc();
    const store = new BoardStore(doc, null, "gm");
    store.add([
      {
        id: "img-1",
        kind: "image",
        layer: "map",
        assetId: "a.png",
        x: 100,
        y: 100,
        width: 200,
        height: 200,
        rotation: 0,
        z: 1,
        locked: false,
        createdBy: "gm",
      },
    ]);
    const [wall] = store.addWalls([
      { kind: "wall", points: [100, 100, 200, 200], attachedTo: "img-1" },
    ]);
    expect(wall?.attachedTo).toBe("img-1");

    // Moving the image shifts the wall points
    store.update({ "img-1": { x: 150, y: 180 } });
    expect(store.getWall(wall?.id ?? "")?.points).toEqual([150, 180, 250, 280]);

    // Undo brings both the image and the wall back to original position
    store.undo();
    expect(store.get("img-1")?.x).toBe(100);
    expect(store.getWall(wall?.id ?? "")?.points).toEqual([100, 100, 200, 200]);

    // Redo shifts them again
    store.redo();
    expect(store.get("img-1")?.x).toBe(150);
    expect(store.getWall(wall?.id ?? "")?.points).toEqual([150, 180, 250, 280]);

    // Removing the image removes the attached wall too
    store.remove(["img-1"]);
    expect(store.get("img-1")).toBeUndefined();
    expect(store.getWalls()).toEqual([]);

    // Undo restores both image and attached wall
    store.undo();
    expect(store.get("img-1")).toBeDefined();
    expect(store.getWalls()).toHaveLength(1);
    expect(store.getWalls()[0]?.points).toEqual([150, 180, 250, 280]);
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

  it("clears the entire board (public items, hidden items, terrain, walls and fog) in one undo step", () => {
    const publicDoc = new Y.Doc();
    const gmDoc = new Y.Doc();
    const store = new BoardStore(publicDoc, gmDoc, "gm");
    expect(store.isEmpty()).toBe(true);

    store.add([text("pub")]);
    store.add([text("secret")], { hidden: true });
    store.addTerrain({
      biome: "grass",
      mode: "paint",
      shape: "brush",
      points: [0, 0, 10, 10],
      width: 40,
    });
    store.addWall({ kind: "wall", points: [0, 0, 70, 0] });
    store.addFog({ mode: "cover", shape: "all", points: [] });
    expect(store.isEmpty()).toBe(false);

    store.clearBoard();
    expect(store.isEmpty()).toBe(true);
    expect(store.getSnapshot()).toEqual([]);
    expect(store.getTerrain()).toEqual([]);
    expect(store.getWalls()).toEqual([]);
    expect(store.getFog()).toEqual([]);

    store.undo();
    expect(store.isEmpty()).toBe(false);
    expect(store.getSnapshot().map((i) => i.id)).toEqual(["pub", "secret"]);
    expect(store.isHidden("secret")).toBe(true);
    expect(store.getTerrain()).toHaveLength(1);
    expect(store.getWalls()).toHaveLength(1);
    expect(store.getFog()).toHaveLength(1);
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
