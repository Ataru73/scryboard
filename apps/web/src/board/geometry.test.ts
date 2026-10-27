import type { ShapeItem, StrokeItem, TokenItem } from "@scryboard/shared";
import { describe, expect, it } from "vitest";
import {
  bakeScale,
  boxesIntersect,
  connectorEnds,
  itemBounds,
  normalizeBox,
  pointInItem,
  pointInPolygon,
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

  it("includes elevation offset in token bounds for marquee selection", () => {
    const grounded = token("g", 100, 100);
    const bounds0 = itemBounds(grounded, 50);
    expect(bounds0).toEqual({ x: 75, y: 75, width: 50, height: 50 });

    const elevated = { ...token("e", 100, 100), elevation: 15 }; // 3 cells up
    const boundsFly = itemBounds(elevated, 50);
    expect(boundsFly.x).toBe(75);
    expect(boundsFly.width).toBe(50);
    expect(boundsFly.y).toBeLessThan(75);
    expect(boundsFly.height).toBeGreaterThan(50);
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

describe("pointInItem", () => {
  it("accounts for rotation", () => {
    // Rettangolo 100×50 con l'angolo in (10, 20).
    expect(pointInItem({ x: 100, y: 60 }, rect)).toBe(true);
    expect(pointInItem({ x: 100, y: 80 }, rect)).toBe(false);
    // Ruotato di 90° attorno all'angolo: ora scende per 100 px verso il basso e va a sinistra.
    const turned = { ...rect, rotation: 90 };
    expect(pointInItem({ x: 0, y: 100 }, turned)).toBe(true);
    expect(pointInItem({ x: 100, y: 60 }, turned)).toBe(false);
  });
});

describe("pointInPolygon", () => {
  it("follows the shape of an L-shaped roof", () => {
    // Una L: 0..100 in larghezza, 0..100 in altezza, con il quadrante in alto a destra vuoto.
    const roof = {
      ...rect,
      id: "roof",
      kind: "roof" as const,
      layer: "map" as const,
      style: "slate" as const,
      x: 0,
      y: 0,
      points: [0, 0, 50, 0, 50, 50, 100, 50, 100, 100, 0, 100],
    };
    expect(pointInPolygon({ x: 25, y: 25 }, roof.points)).toBe(true);
    expect(pointInPolygon({ x: 75, y: 25 }, roof.points)).toBe(false);
    expect(pointInItem({ x: 75, y: 75 }, roof)).toBe(true);
    expect(pointInItem({ x: 75, y: 25 }, roof)).toBe(false);
  });
});
