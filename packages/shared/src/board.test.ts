import { describe, expect, it } from "vitest";
import { type BoardItem, boardItemSchema, compareItems } from "./board";
import { terrainOpSchema } from "./terrain";

const base = { x: 0, y: 0, rotation: 0, locked: false, createdBy: "u" };

describe("board items", () => {
  it("validates each kind", () => {
    const items: unknown[] = [
      {
        ...base,
        id: "p",
        layer: "paths",
        z: 0,
        kind: "path",
        style: "river",
        points: [0, 0, 40, 100, 50, 80],
      },
      {
        ...base,
        id: "t",
        layer: "token",
        z: 0,
        kind: "token",
        name: "Goblin",
        color: "#46a758",
        assetId: null,
        size: 1,
      },
      {
        ...base,
        id: "a",
        layer: "map",
        z: 0,
        kind: "image",
        assetId: "x.png",
        width: 10,
        height: 10,
      },
      {
        ...base,
        id: "b",
        layer: "draw",
        z: 0,
        kind: "stroke",
        points: [0, 0, 1, 1],
        color: "#ffffff",
        strokeWidth: 2,
      },
      {
        ...base,
        id: "c",
        layer: "draw",
        z: 0,
        kind: "shape",
        shape: "line",
        width: -5,
        height: 3,
        color: "#ffffff",
        strokeWidth: 2,
        fill: null,
      },
      {
        ...base,
        id: "d",
        layer: "draw",
        z: 0,
        kind: "text",
        text: "Ciao",
        fontSize: 24,
        color: "#000000",
        width: null,
      },
      {
        ...base,
        id: "s_proc",
        layer: "map",
        z: 0,
        kind: "stamp",
        stamp: "tree",
        size: 2,
        variant: 12,
      },
      {
        ...base,
        id: "s_img",
        layer: "map",
        z: 0,
        kind: "stamp",
        assetId: "chest.webp",
        size: 1,
      },
    ];
    for (const item of items) expect(boardItemSchema.safeParse(item).success).toBe(true);
  });

  it("rejects stamps without stamp id or assetId", () => {
    const invalidStamp = {
      ...base,
      id: "s_bad",
      layer: "map",
      z: 0,
      kind: "stamp",
      size: 1,
    };
    expect(boardItemSchema.safeParse(invalidStamp).success).toBe(false);
  });

  it("rejects paths with a single point, broken triples or zero widths", () => {
    const path = (points: number[]) => ({
      ...base,
      id: "p",
      layer: "paths",
      z: 0,
      kind: "path",
      style: "trail",
      points,
    });
    expect(boardItemSchema.safeParse(path([0, 0, 10])).success).toBe(false);
    expect(boardItemSchema.safeParse(path([0, 0, 10, 5, 5])).success).toBe(false);
    expect(boardItemSchema.safeParse(path([0, 0, 10, 5, 5, 0])).success).toBe(false);
    expect(boardItemSchema.safeParse(path([0, 0, 10, 5, 5, 8])).success).toBe(true);
  });

  it("validates terrain fills: rings must cover the points exactly", () => {
    const fill = (points: number[], rings?: number[]) => ({
      id: "f",
      seq: 1,
      biome: "grass",
      mode: "paint",
      shape: "fill",
      points,
      rings,
    });
    const square = [0, 0, 10, 0, 10, 10, 0, 10];
    expect(terrainOpSchema.safeParse(fill(square, [8])).success).toBe(true);
    expect(terrainOpSchema.safeParse(fill(square)).success).toBe(false);
    expect(terrainOpSchema.safeParse(fill(square, [6])).success).toBe(false);
    expect(terrainOpSchema.safeParse({ ...fill(square, [8]), clip: [0, 0, 5] }).success).toBe(
      false,
    );
  });

  it("rejects malformed items", () => {
    expect(
      boardItemSchema.safeParse({ ...base, id: "a", layer: "sky", z: 0, kind: "text" }).success,
    ).toBe(false);
    expect(
      boardItemSchema.safeParse({
        ...base,
        id: "b",
        layer: "draw",
        z: 0,
        kind: "stroke",
        points: [],
        color: "red",
        strokeWidth: 2,
      }).success,
    ).toBe(false);
  });

  it("sorts by layer, then z, then id", () => {
    const mk = (id: string, layer: BoardItem["layer"], z: number) =>
      ({
        ...base,
        id,
        layer,
        z,
        kind: "text",
        text: "",
        fontSize: 1,
        color: "#000000",
        width: null,
      }) as BoardItem;
    const sorted = [
      mk("d", "draw", 0),
      mk("m", "map", 5),
      mk("c", "draw", -1),
      mk("b", "draw", 0),
    ].sort(compareItems);
    expect(sorted.map((i) => i.id)).toEqual(["m", "c", "b", "d"]);
  });
});

describe("token portrait", () => {
  const token = {
    ...base,
    id: "t",
    layer: "token",
    z: 0,
    kind: "token",
    name: "Goblin",
    color: "#46a758",
    assetId: null,
    size: 1,
  };

  it("is optional, so tokens created before the library stay valid", () => {
    expect(boardItemSchema.safeParse(token).success).toBe(true);
    expect(boardItemSchema.safeParse({ ...token, portrait: null }).success).toBe(true);
  });

  it("accepts catalog ids, including ones this client does not know", () => {
    expect(boardItemSchema.safeParse({ ...token, portrait: "goblin" }).success).toBe(true);
    expect(boardItemSchema.safeParse({ ...token, portrait: "futuro-2" }).success).toBe(true);
  });

  it("rejects malformed ids", () => {
    for (const portrait of ["", "Goblin", "a b", "x".repeat(41), 3]) {
      expect(boardItemSchema.safeParse({ ...token, portrait }).success).toBe(false);
    }
  });
});
