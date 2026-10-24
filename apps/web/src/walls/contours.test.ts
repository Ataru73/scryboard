import { describe, expect, it } from "vitest";
import { marchingSquares, maskContours, simplifyClosedContour } from "./contours";

function raster(width: number, height: number, active: Array<readonly [number, number]>) {
  const mask = new Uint8Array(width * height);
  for (const [x, y] of active) mask[y * width + x] = 1;
  return mask;
}

function pairs(contour: number[]) {
  const result: Array<readonly [number, number]> = [];
  for (let i = 0; i + 1 < contour.length; i += 2) {
    result.push([contour[i] as number, contour[i + 1] as number]);
  }
  return result;
}

function area(contour: number[]) {
  const points = pairs(contour);
  let sum = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as readonly [number, number];
    const b = points[i + 1] as readonly [number, number];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

function bounds(contour: number[]) {
  const points = pairs(contour).slice(0, -1);
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

type TestPoint = readonly [number, number];

function orientation(a: TestPoint, b: TestPoint, c: TestPoint): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(point: TestPoint, a: TestPoint, b: TestPoint): boolean {
  return (
    Math.min(a[0], b[0]) <= point[0] &&
    point[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= point[1] &&
    point[1] <= Math.max(a[1], b[1])
  );
}

function segmentsIntersect(a: TestPoint, b: TestPoint, c: TestPoint, d: TestPoint): boolean {
  if (
    Math.max(a[0], b[0]) < Math.min(c[0], d[0]) ||
    Math.max(c[0], d[0]) < Math.min(a[0], b[0]) ||
    Math.max(a[1], b[1]) < Math.min(c[1], d[1]) ||
    Math.max(c[1], d[1]) < Math.min(a[1], b[1])
  ) {
    return false;
  }
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return true;
  return (
    (abC === 0 && onSegment(c, a, b)) ||
    (abD === 0 && onSegment(d, a, b)) ||
    (cdA === 0 && onSegment(a, c, d)) ||
    (cdB === 0 && onSegment(b, c, d))
  );
}

function firstSelfIntersection(contour: number[]): [number, number] | null {
  const vertices = pairs(contour).slice(0, -1);
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      if (j === i + 1 || (i === 0 && j === vertices.length - 1)) continue;
      if (
        segmentsIntersect(
          vertices[i] as TestPoint,
          vertices[(i + 1) % vertices.length] as TestPoint,
          vertices[j] as TestPoint,
          vertices[(j + 1) % vertices.length] as TestPoint,
        )
      ) {
        return [i, j];
      }
    }
  }
  return null;
}

function expectSimpleClosedLoop(contour: number[], label = "") {
  expect(contour.length, label).toBeGreaterThanOrEqual(8);
  expect(contour.length % 2, label).toBe(0);
  const points = pairs(contour);
  expect(points.at(-1), label).toEqual(points[0]);
  const keys = points.slice(0, -1).map(([x, y]) => `${x},${y}`);
  expect(new Set(keys).size, label).toBe(keys.length);
  expect(contour.every(Number.isFinite), label).toBe(true);
  expect(area(contour), label).not.toBe(0);
  expect(firstSelfIntersection(contour), label).toBeNull();
}

describe("marchingSquares", () => {
  it("returns no contours for empty or empty-sized rasters", () => {
    expect(marchingSquares(new Uint8Array(9), 3, 3)).toEqual([]);
    expect(marchingSquares(new Uint8Array(), 0, 0)).toEqual([]);
  });

  it("closes a single pixel with interpolated pixel coordinates", () => {
    const contours = marchingSquares(raster(1, 1, [[0, 0]]), 1, 1);
    expect(contours).toHaveLength(1);
    const contour = contours[0] as number[];
    expectSimpleClosedLoop(contour);
    expect(pairs(contour)).toHaveLength(5);
    expect(bounds(contour)).toEqual({ left: -0.5, right: 0.5, top: -0.5, bottom: 0.5 });
    expect(Math.abs(area(contour))).toBeCloseTo(0.5);
  });

  it("closes regions touching every raster edge using an empty exterior", () => {
    const contours = marchingSquares(
      raster(2, 2, [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]),
      2,
      2,
    );
    expect(contours).toHaveLength(1);
    const contour = contours[0] as number[];
    expectSimpleClosedLoop(contour);
    expect(bounds(contour)).toEqual({ left: -0.5, right: 1.5, top: -0.5, bottom: 1.5 });
  });

  it("keeps disjoint regions separate", () => {
    const contours = marchingSquares(
      raster(5, 3, [
        [0, 1],
        [3, 1],
      ]),
      5,
      3,
    );
    expect(contours).toHaveLength(2);
    for (const contour of contours) {
      expectSimpleClosedLoop(contour);
      expect(Math.abs(area(contour))).toBeCloseTo(0.5);
    }
    const centers = contours.map((contour) => {
      const box = bounds(contour);
      return (box.left + box.right) / 2;
    });
    expect(centers.sort((a, b) => a - b)).toEqual([0, 3]);
  });

  it("extracts both the exterior and the hole of a ring", () => {
    const ring = raster(3, 3, [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
    const contours = marchingSquares(ring, 3, 3);
    expect(contours).toHaveLength(2);
    for (const contour of contours) expectSimpleClosedLoop(contour);
    const areas = contours.map((contour) => Math.abs(area(contour))).sort((a, b) => a - b);
    expect(areas[0]).toBeCloseTo(0.5);
    expect(areas[1]).toBeCloseTo(8.5);
    const hole = contours.find((contour) => Math.abs(area(contour)) < 1) as number[];
    expect(bounds(hole)).toEqual({ left: 0.5, right: 1.5, top: 0.5, bottom: 1.5 });
  });

  it.each([
    [
      [1, 0],
      [0, 1],
    ],
    [
      [0, 1],
      [1, 0],
    ],
  ] as const)("resolves a saddle without branches or duplicated vertices", (first, second) => {
    const contours = marchingSquares(raster(2, 2, [first, second]), 2, 2);
    expect(contours).toHaveLength(2);
    for (const contour of contours) {
      expectSimpleClosedLoop(contour);
      expect(Math.abs(area(contour))).toBeCloseTo(0.5);
    }
  });

  it("handles one-pixel-wide regions without duplicate points", () => {
    const contours = marchingSquares(
      raster(3, 3, [
        [0, 1],
        [1, 1],
        [2, 1],
      ]),
      3,
      3,
    );
    expect(contours).toHaveLength(1);
    expectSimpleClosedLoop(contours[0] as number[]);
  });

  it("interpolates alpha thresholds on shared edges", () => {
    const contours = marchingSquares(new Uint8Array([0, 255]), 2, 1, 127.5);
    expect(contours).toHaveLength(1);
    const contour = contours[0] as number[];
    expectSimpleClosedLoop(contour);
    expect(bounds(contour)).toEqual({ left: 0.5, right: 1.5, top: -0.5, bottom: 0.5 });
    expect(contour).toContain(0.5);
  });

  it("keeps every 3×3 binary configuration finite, closed and duplicate-free", () => {
    for (let bits = 0; bits < 512; bits++) {
      const mask = new Uint8Array(9);
      for (let i = 0; i < mask.length; i++) mask[i] = (bits >> i) & 1;
      for (const contour of marchingSquares(mask, 3, 3)) expectSimpleClosedLoop(contour);
    }
  });

  it("validates dimensions and mask length", () => {
    expect(() => marchingSquares(new Uint8Array(2), 2, 2)).toThrow(RangeError);
    expect(() => marchingSquares(new Uint8Array(), -1, 0)).toThrow(RangeError);
  });
});

describe("closed-loop RDP", () => {
  const denseSquare = [0, 0, 1, 0, 2, 0, 2, 1, 2, 2, 1, 2, 0, 2, 0, 1, 0, 0];

  it("removes collinear points without collapsing the loop onto its closing baseline", () => {
    const simplified = simplifyClosedContour(denseSquare, 0);
    expectSimpleClosedLoop(simplified);
    expect(pairs(simplified)).toHaveLength(5);
    expect(
      new Set(
        pairs(simplified)
          .slice(0, -1)
          .map((point) => point.join(",")),
      ),
    ).toEqual(new Set(["0,0", "2,0", "2,2", "0,2"]));
  });

  it("preserves points that exceed the tolerance", () => {
    const withBump = [0, 0, 1, 0.4, 2, 0, 2, 2, 0, 2, 0, 0];
    const simplified = simplifyClosedContour(withBump, 0.1);
    expect(pairs(simplified).some(([x, y]) => x === 1 && y === 0.4)).toBe(true);
    expectSimpleClosedLoop(simplified);
  });

  it("keeps at least a triangle even with an excessive tolerance", () => {
    const simplified = simplifyClosedContour(denseSquare, 1000);
    expectSimpleClosedLoop(simplified);
    expect(pairs(simplified).length).toBeGreaterThanOrEqual(4);
  });

  it("rejects degenerate loops and malformed input", () => {
    expect(simplifyClosedContour([0, 0, 1, 1, 0, 0], 0)).toEqual([]);
    expect(() => simplifyClosedContour([0, 0, 1], 0)).toThrow(RangeError);
    expect(() => simplifyClosedContour(denseSquare, -1)).toThrow(RangeError);
  });
});

describe("maskContours", () => {
  it("combines extraction and simplification", () => {
    const mask = raster(5, 5, [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
      [0, 2],
      [1, 2],
      [2, 2],
      [3, 2],
      [4, 2],
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
      [4, 3],
      [0, 4],
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ]);
    const raw = marchingSquares(mask, 5, 5);
    const simplified = maskContours(mask, 5, 5, { tolerance: 0 });
    expect(simplified).toHaveLength(1);
    expect((simplified[0] as number[]).length).toBeLessThan((raw[0] as number[]).length);
    expectSimpleClosedLoop(simplified[0] as number[]);
  });

  it("falls back to collinear simplification when RDP crosses a concave contour", () => {
    const mask = new Uint8Array(Array.from("1110001110010000111100010", Number));
    const raw = marchingSquares(mask, 5, 5)[0] as number[];
    const unsafe = simplifyClosedContour(raw, 1.5);
    expect(firstSelfIntersection(unsafe)).not.toBeNull();

    const simplified = maskContours(mask, 5, 5, { tolerance: 1.5 })[0] as number[];
    expectSimpleClosedLoop(simplified);
    expect(simplified).toEqual(simplifyClosedContour(raw, 0));
    expect(simplified.length).toBeLessThan(raw.length);
  });

  it("keeps randomized small masks simple at several tolerances", () => {
    let state = 0x9e3779b9;
    const random = () => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state / 0x1_0000_0000;
    };
    for (let sample = 0; sample < 80; sample++) {
      const mask = new Uint8Array(25);
      for (let i = 0; i < mask.length; i++) mask[i] = random() < 0.5 ? 0 : 1;
      for (const tolerance of [0, 0.25, 0.75, 1.5]) {
        for (const contour of maskContours(mask, 5, 5, { tolerance })) {
          expectSimpleClosedLoop(
            contour,
            `sample=${sample}, tolerance=${tolerance}, mask=${Array.from(mask).join("")}`,
          );
        }
      }
    }
  });
});
