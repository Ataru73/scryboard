import type { ShapeItem, StrokeItem, TokenItem } from "@scryboard/shared";
import { describe, expect, it } from "vitest";
import {
  bakeScale,
  boxesIntersect,
  connectorEnds,
  itemBounds,
  normalizeBox,
  unionBounds,
} from "./geometry";

const base = { layer: "draw" as const, z: 0, rotation: 0, locked: false, createdBy: "u" };
const rect: ShapeItem = {
  ...base,
  id: "r",
  kind: "shape",
  shape: "rect",
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  color: "#000000",
  strokeWidth: 2,
  fill: null,
};
const stroke: StrokeItem = {
  ...base,
  id: "s",
  kind: "stroke",
  x: 0,
  y: 0,
  points: [0, 0, 10, 20],
  color: "#000000",
  strokeWidth: 2,
};

describe("geometry", () => {
  it("normalizes boxes drawn in any direction", () => {
    expect(normalizeBox({ x: 10, y: 10 }, { x: 0, y: 5 })).toEqual({
      x: 0,
      y: 5,
      width: 10,
      height: 5,
    });
  });

  it("computes bounds of rotated items", () => {
    expect(itemBounds(rect)).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    const rotated = itemBounds({ ...rect, rotation: 90 });
    expect(rotated.x).toBeCloseTo(-40);
    expect(rotated.y).toBeCloseTo(20);
    expect(rotated.width).toBeCloseTo(50);
    expect(rotated.height).toBeCloseTo(100);
  });

  it("includes stroke width in stroke bounds", () => {
    expect(itemBounds(stroke)).toEqual({ x: -1, y: -1, width: 12, height: 22 });
  });

  it("unions bounds", () => {
    expect(unionBounds([])).toBeNull();
    expect(unionBounds([rect, stroke])).toEqual({ x: -1, y: -1, width: 111, height: 71 });
  });

  it("bakes transformer scale into item dimensions", () => {
    expect(bakeScale(rect, 2, 0.5)).toEqual({ width: 200, height: 25 });
    expect(bakeScale(stroke, 2, 3)).toEqual({ points: [0, 0, 20, 60] });
  });

  it("detects box intersections", () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(boxesIntersect(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(boxesIntersect(a, { x: 10, y: 0, width: 5, height: 5 })).toBe(true);
    expect(boxesIntersect(a, { x: 11, y: 0, width: 5, height: 5 })).toBe(false);
  });
});

describe("connectorEnds", () => {
  const token = (id: string, x: number, y: number): TokenItem => ({
    ...base,
    layer: "token",
    id,
    kind: "token",
    x,
    y,
    name: id,
    color: "#000000",
    assetId: null,
    size: 1,
  });

  it("runs from the edge of one token to the edge of the other", () => {
    // Token di 50 px (raggio 25) più 4 px di margine.
    expect(connectorEnds(token("a", 0, 0), token("b", 200, 0), 50)).toEqual({
      from: { x: 29, y: 0 },
      to: { x: 171, y: 0 },
    });
  });

  it("stops on the border of boxes and follows dragged items", () => {
    // Il rettangolo va da (10, 20) a (110, 70): centro (60, 45).
    const ends = connectorEnds(token("a", 60, 300), rect, 50, new Map([["a", { x: 0, y: -50 }]]));
    expect(ends.from).toEqual({ x: 60, y: 221 });
    expect(ends.to).toEqual({ x: 60, y: 74 });
  });

  it("joins the centers of overlapping items", () => {
    expect(connectorEnds(token("a", 0, 0), token("b", 10, 0), 50)).toEqual({
      from: { x: 0, y: 0 },
      to: { x: 10, y: 0 },
    });
  });
});
