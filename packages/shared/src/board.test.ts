import { describe, expect, it } from "vitest";
import { type BoardItem, boardItemSchema, compareItems } from "./board";

const base = { x: 0, y: 0, rotation: 0, locked: false, createdBy: "u" };

describe("board items", () => {
  it("validates each kind", () => {
    const items: unknown[] = [
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
    ];
    for (const item of items) expect(boardItemSchema.safeParse(item).success).toBe(true);
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
