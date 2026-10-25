import type { TerrainOp } from "@scryboard/shared";
import { describe, expect, it } from "vitest";
import { brushCircles, chaikinClosed, regionOutline, simplify, terrainOpBounds } from "./geometry";

const op = (extra: Partial<TerrainOp>): TerrainOp => ({
  id: "op",
  seq: 1,
  biome: "grass",
  mode: "paint",
  shape: "brush",
  points: [0, 0, 100, 0],
  width: 30,
  ...extra,
});

describe("terrain geometry", () => {
  it("simplifies nearly straight strokes", () => {
    expect(simplify([0, 0, 50, 0.4, 100, 0], 1)).toEqual([0, 0, 100, 0]);
    expect(simplify([0, 0, 50, 20, 100, 0], 1)).toEqual([0, 0, 50, 20, 100, 0]);
    expect(simplify([5, 5], 1)).toEqual([5, 5]);
  });

  it("smooths polygons by cutting corners", () => {
    const square = [0, 0, 10, 0, 10, 10, 0, 10];
    const once = chaikinClosed(square, 1);
    expect(once).toHaveLength(16);
    expect(once.slice(0, 4)).toEqual([2.5, 0, 7.5, 0]);
  });

  it("covers a stroke with evenly spaced, slightly irregular circles", () => {
    const circles = brushCircles(op({}));
    expect(circles[0]?.slice(0, 2)).toEqual([0, 0]);
    expect(circles.at(-1)?.[0]).toBeGreaterThan(90);
    for (const [, , r] of circles) {
      expect(r).toBeGreaterThan(15 * 0.79);
      expect(r).toBeLessThan(15 * 1.21);
    }
    // Deterministico: lo stesso id dà sempre le stesse forme, su ogni client.
    expect(brushCircles(op({}))).toEqual(circles);
    expect(brushCircles(op({ id: "other" }))).not.toEqual(circles);
  });

  it("keeps region outlines close to the drawn polygon", () => {
    const outline = regionOutline({ id: "r", points: [0, 0, 100, 0, 100, 100, 0, 100] });
    for (let i = 0; i < outline.length; i += 2) {
      expect(outline[i]).toBeGreaterThan(-9);
      expect(outline[i]).toBeLessThan(109);
    }
  });

  it("keeps exact region outlines unchanged", () => {
    const points = [0, 0, 100, 0, 100, 100, 0, 100];
    const outline = regionOutline({ id: "r", points, exact: true });
    expect(outline).toEqual(points);
  });

  it("includes the irregular edge and the soft fade in the bounds", () => {
    const b = terrainOpBounds(op({}));
    expect(b.x).toBeLessThan(-15 * 1.2);
    expect(b.x + b.width).toBeGreaterThan(100 + 15 * 1.2);
  });

  it("uses minimal margin for exact regions", () => {
    const b = terrainOpBounds(op({ shape: "region", exact: true, points: [0, 0, 100, 100] }));
    expect(b).toEqual({ x: -2, y: -2, width: 104, height: 104 });
  });
});
