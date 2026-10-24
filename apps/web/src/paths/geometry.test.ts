import { describe, expect, it } from "vitest";
import {
  applyTaper,
  catmullRom,
  insertPoint,
  nearestSegment,
  type PathPoint,
  pathBounds,
  pathOutline,
  toFlat,
  toPathPoints,
} from "./geometry";

const line: PathPoint[] = [
  { x: 0, y: 0, w: 20 },
  { x: 100, y: 0, w: 40 },
  { x: 200, y: 50, w: 20 },
];

describe("path geometry", () => {
  it("converts between triples and points", () => {
    expect(toPathPoints([1, 2, 3, 4, 5, 6])).toEqual([
      { x: 1, y: 2, w: 3 },
      { x: 4, y: 5, w: 6 },
    ]);
    expect(toFlat(line)).toHaveLength(9);
  });

  it("passes through every control point with interpolated widths", () => {
    const samples = catmullRom(line);
    for (const control of line) {
      expect(
        samples.some(
          (s) => Math.hypot(s.x - control.x, s.y - control.y) < 1e-9 && s.w === control.w,
        ),
      ).toBe(true);
    }
    // Un campione ogni ~8 px.
    expect(samples.length).toBeGreaterThan(25);
    const mid = samples.find((s) => s.x > 45 && s.x < 55);
    expect(mid?.w).toBeGreaterThan(20);
    expect(mid?.w).toBeLessThan(40);
  });

  it("tapers both ends down to 15% of the width", () => {
    const samples = applyTaper(
      catmullRom([
        { x: 0, y: 0, w: 40 },
        { x: 400, y: 0, w: 40 },
      ]),
      100,
    );
    expect(samples[0]?.w).toBeCloseTo(6);
    expect(samples.at(-1)?.w).toBeCloseTo(6);
    expect(samples.find((s) => s.x > 190 && s.x < 210)?.w).toBeCloseTo(40);
  });

  it("builds a closed outline at half the width on each side", () => {
    const outline = pathOutline(
      [
        { x: 0, y: 0, w: 20 },
        { x: 100, y: 0, w: 20 },
      ],
      false,
    );
    expect(outline).toEqual([0, 10, 100, 10, 100, -10, 0, -10]);
    const rounded = pathOutline(
      [
        { x: 0, y: 0, w: 20 },
        { x: 100, y: 0, w: 20 },
      ],
      true,
    );
    expect(rounded.length).toBe(8 + 2 * 7 * 2);
    const xs = rounded.filter((_, i) => i % 2 === 0);
    expect(Math.max(...xs)).toBeCloseTo(110, 0);
    expect(Math.min(...xs)).toBeCloseTo(-10, 0);
    // Il semicerchio finale sta tutto oltre l'ultimo punto, quello iniziale prima del primo.
    expect(
      rounded
        .slice(4, 18)
        .filter((_, i) => i % 2 === 0)
        .every((x) => x >= 100),
    ).toBe(true);
    expect(
      rounded
        .slice(22)
        .filter((_, i) => i % 2 === 0)
        .every((x) => x <= 0),
    ).toBe(true);
  });

  it("measures bounds including the widest point", () => {
    expect(pathBounds(toFlat(line))).toEqual({ x: -20, y: -20, width: 240, height: 90 });
  });

  it("finds where to insert a new control point", () => {
    const hit = nearestSegment(line, { x: 50, y: 5 });
    expect(hit.index).toBe(0);
    expect(hit.t).toBeCloseTo(0.5);
    expect(hit.distance).toBeCloseTo(5);
    const inserted = insertPoint(line, hit.index, hit.t);
    expect(inserted).toHaveLength(4);
    expect(inserted[1]).toEqual({ x: 50, y: 0, w: 30 });
  });
});
