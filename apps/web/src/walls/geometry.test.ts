import type { Wall } from "@scryboard/shared";
import { describe, expect, it } from "vitest";
import type { Point } from "../board/viewport";
import {
  constrainMovement,
  movementFraction,
  newContours,
  segmentIntersection,
  type WallSegment,
  wallSegments,
} from "./geometry";

const p = (x: number, y: number): Point => ({ x, y });
const barrier = (
  points: number[],
  kind: "wall" | "window" | "invisible" = "wall",
  id = kind,
): Wall => ({ id, kind, points });
const door = (state: "open" | "closed" | "locked"): Wall => ({
  id: `door-${state}`,
  kind: "door",
  door: state,
  points: [5, -5, 5, 5],
});
const segment = (a: Point, b: Point): WallSegment => ({
  a,
  b,
  wall: barrier([a.x, a.y, b.x, b.y]),
});

describe("wallSegments", () => {
  it("expands every polyline edge and retains its source wall", () => {
    const wall = barrier([0, 0, 10, 0, 10, 10, 20, 10]);
    const segments = wallSegments([wall]);
    expect(segments).toHaveLength(3);
    expect(segments[1]).toEqual({ a: p(10, 0), b: p(10, 10), wall });
    expect(wallSegments(new Set([wall]))).toEqual(segments);
  });

  it("blocks walls, windows, invisible walls and non-open doors", () => {
    const walls = [
      barrier([0, 0, 1, 0], "wall"),
      barrier([0, 1, 1, 1], "window"),
      barrier([0, 2, 1, 2], "invisible"),
      door("closed"),
      door("locked"),
    ];
    expect(wallSegments(walls).map((entry) => entry.wall.id)).toEqual([
      "wall",
      "window",
      "invisible",
      "door-closed",
      "door-locked",
    ]);
  });

  it("omits open doors", () => {
    expect(wallSegments([door("open")])).toEqual([]);
    expect(constrainMovement(p(0, 0), p(10, 0), wallSegments([door("open")]))).toEqual(p(10, 0));
  });

  it("opens a gap in a wall under an open door", () => {
    const wall = barrier([0, 0, 0, 70, 0, 140]);
    const onWall: Wall = { id: "d", kind: "door", door: "open", points: [3, 50, 3, 90] };
    const segments = wallSegments([wall, onWall]);
    expect(segments.map(({ a, b }) => [a, b])).toEqual([
      [p(0, 0), p(0, 50)],
      [p(0, 90), p(0, 140)],
    ]);
    expect(constrainMovement(p(-20, 70), p(20, 70), segments)).toEqual(p(20, 70));
    expect(constrainMovement(p(-20, 20), p(20, 20), segments).x).toBeLessThan(0);
  });

  it("keeps the wall under a closed door or under an open door far from it", () => {
    const wall = barrier([0, 0, 0, 140]);
    const closed: Wall = { id: "c", kind: "door", door: "closed", points: [0, 50, 0, 90] };
    const far: Wall = { id: "f", kind: "door", door: "open", points: [30, 50, 30, 90] };
    expect(wallSegments([wall, closed, far]).map((s) => s.wall.id)).toEqual(["wall", "c"]);
    expect(wallSegments([wall, far])[0]).toEqual({ a: p(0, 0), b: p(0, 140), wall });
  });
});

describe("segmentIntersection", () => {
  it("finds a proper crossing on both segments", () => {
    const hit = segmentIntersection(p(0, 0), p(10, 0), p(5, -5), p(5, 5));
    expect(hit).not.toBeNull();
    expect(hit?.t).toBeCloseTo(0.5);
    expect(hit?.u).toBeCloseTo(0.5);
    expect(hit?.x).toBeCloseTo(5);
    expect(hit?.y).toBeCloseTo(0);
  });

  it("includes shared endpoints but rejects intersections on extensions", () => {
    expect(segmentIntersection(p(0, 0), p(5, 0), p(5, 0), p(5, 5))).toMatchObject({
      t: 1,
      u: 0,
      x: 5,
      y: 0,
    });
    expect(segmentIntersection(p(0, 0), p(1, 0), p(2, -1), p(2, 1))).toBeNull();
    expect(segmentIntersection(p(0, 0), p(1, 0), p(0.5, 1), p(0.5, 2))).toBeNull();
  });

  it("handles parallel, disjoint collinear and touching collinear segments", () => {
    expect(segmentIntersection(p(0, 0), p(10, 0), p(0, 1), p(10, 1))).toBeNull();
    expect(segmentIntersection(p(0, 0), p(2, 0), p(3, 0), p(4, 0))).toBeNull();
    expect(segmentIntersection(p(0, 0), p(2, 0), p(2, 0), p(4, 0))).toMatchObject({
      t: 1,
      u: 0,
      x: 2,
      y: 0,
    });
  });

  it("returns the earliest overlap for coincident and reversed segments", () => {
    const overlap = segmentIntersection(p(0, 0), p(10, 0), p(3, 0), p(7, 0));
    expect(overlap).toMatchObject({ u: 0, x: 3, y: 0 });
    expect(overlap?.t).toBeCloseTo(0.3);

    const reversed = segmentIntersection(p(0, 0), p(10, 0), p(8, 0), p(4, 0));
    expect(reversed).toMatchObject({ x: 4, y: 0 });
    expect(reversed?.t).toBeCloseTo(0.4);
    expect(reversed?.u).toBeCloseTo(1);

    const identical = segmentIntersection(p(1, 1), p(3, 3), p(1, 1), p(3, 3));
    expect(identical).toMatchObject({ t: 0, u: 0, x: 1, y: 1 });
  });

  it("treats zero-length segments as points without producing NaN", () => {
    expect(segmentIntersection(p(0, 0), p(0, 0), p(-1, 0), p(1, 0))).toMatchObject({
      t: 0,
      x: 0,
      y: 0,
    });
    const pointOnFirst = segmentIntersection(p(-1, 0), p(1, 0), p(0.5, 0), p(0.5, 0));
    expect(pointOnFirst).toMatchObject({ u: 0, x: 0.5, y: 0 });
    expect(pointOnFirst?.t).toBeCloseTo(0.75);
    expect(segmentIntersection(p(0, 0), p(0, 0), p(0, 0), p(0, 0))).toMatchObject({
      t: 0,
      u: 0,
    });
    expect(segmentIntersection(p(0, 0), p(0, 0), p(1, 0), p(2, 0))).toBeNull();
  });

  it("rejects non-finite input", () => {
    expect(segmentIntersection(p(Number.NaN, 0), p(1, 0), p(0, 0), p(0, 1))).toBeNull();
    expect(segmentIntersection(p(0, 0), p(1, 0), p(0, Infinity), p(0, 1))).toBeNull();
  });
});

describe("movement constraint", () => {
  it("allows unobstructed movement and preserves inputs", () => {
    const start = p(1, 2);
    const end = p(4, 6);
    expect(movementFraction(start, end, [])).toBe(1);
    expect(constrainMovement(start, end, [])).toEqual(end);
    expect(start).toEqual(p(1, 2));
    expect(end).toEqual(p(4, 6));
  });

  it("stops long jumps before a wall instead of tunnelling through it", () => {
    const walls = [segment(p(500, -10), p(500, 10))];
    const fraction = movementFraction(p(0, 0), p(1000, 0), walls);
    expect(fraction).toBeCloseTo(0.4995);
    expect(constrainMovement(p(0, 0), p(1000, 0), walls)).toEqual(p(499.5, 0));
  });

  it("chooses the nearest impact among all segments", () => {
    const walls = [
      segment(p(400, -10), p(400, 10)),
      segment(p(200, -10), p(200, 10)),
      segment(p(100, 10), p(100, 20)),
      segment(p(-100, -10), p(-100, 10)),
    ];
    expect(constrainMovement(p(0, 0), p(1000, 0), walls)).toEqual(p(199.5, 0));
  });

  it("backs off along diagonal movement, not along an axis", () => {
    const result = constrainMovement(p(0, 0), p(20, 20), [segment(p(15, 0), p(15, 30))]);
    expect(result.x).toBeCloseTo(15 - 0.5 / Math.sqrt(2));
    expect(result.y).toBeCloseTo(15 - 0.5 / Math.sqrt(2));
  });

  it("never backs up past the start on short movements", () => {
    const walls = [segment(p(0.1, -1), p(0.1, 1))];
    expect(movementFraction(p(0, 0), p(0.2, 0), walls)).toBe(0);
    expect(constrainMovement(p(0, 0), p(0.2, 0), walls)).toEqual(p(0, 0));
  });

  it("ignores an intersection at t=0 so a token can detach from a wall", () => {
    const walls = [segment(p(0, -10), p(0, 10))];
    expect(movementFraction(p(0, 0), p(-10, 0), walls)).toBe(1);
    expect(constrainMovement(p(0, 0), p(-10, 0), walls)).toEqual(p(-10, 0));
  });

  it("handles a hit at the destination and a stationary token", () => {
    const walls = [segment(p(10, -10), p(10, 10))];
    expect(constrainMovement(p(0, 0), p(20, 0), walls)).toEqual(p(9.5, 0));
    expect(movementFraction(p(0, 0), p(0, 0), walls)).toBe(1);
    expect(constrainMovement(p(0, 0), p(0, 0), walls)).toEqual(p(0, 0));
  });
});

describe("newContours", () => {
  it("skips contours that already exist as walls, and duplicates among themselves", () => {
    const square = [0, 0, 10, 0, 10, 10, 0, 0];
    const other = [20, 20, 30, 20, 30, 30, 20, 20];
    const existing = [
      { id: "w", kind: "wall" as const, points: [0, 0, 10.000001, 0, 10, 10, 0, 0] },
    ];
    expect(newContours([square, other, other], existing)).toEqual([other]);
    expect(newContours([square], [])).toEqual([square]);
  });
});
