import { describe, expect, it } from "vitest";
import {
  blocksMovement,
  blocksSight,
  canPlayerToggleDoor,
  sideOfSegment,
  wallSchema,
} from "./walls";

const wall = {
  id: "w",
  kind: "wall",
  points: [0, 0, 70, 0, 70, 70],
};
const door = {
  id: "d",
  kind: "door",
  points: [0, 0, 70, 0],
  door: "closed",
};

describe("wallSchema", () => {
  it("accepts polylines and all door states", () => {
    expect(wallSchema.safeParse(wall).success).toBe(true);
    expect(wallSchema.safeParse({ ...wall, kind: "window" }).success).toBe(true);
    expect(wallSchema.safeParse({ ...wall, kind: "invisible" }).success).toBe(true);
    expect(wallSchema.safeParse({ ...wall, attachedTo: "img-123" }).success).toBe(true);
    expect(wallSchema.safeParse({ ...door, attachedTo: "img-123" }).success).toBe(true);
    for (const state of ["open", "closed", "locked"]) {
      expect(wallSchema.safeParse({ ...door, door: state }).success).toBe(true);
    }
  });

  it("rejects malformed points, door states and unknown fields", () => {
    expect(wallSchema.safeParse({ ...wall, points: [0, 0, 1] }).success).toBe(false);
    expect(wallSchema.safeParse({ ...wall, points: [0, 0] }).success).toBe(false);
    expect(wallSchema.safeParse({ ...door, points: [0, 0, 70, 0, 70, 70] }).success).toBe(false);
    expect(wallSchema.safeParse({ ...wall, door: "closed" }).success).toBe(false);
    expect(wallSchema.safeParse({ ...door, door: "broken" }).success).toBe(false);
    expect(wallSchema.safeParse({ ...wall, hidden: true }).success).toBe(false);
  });
});

describe("wall rules", () => {
  it("blocks movement except through open doors", () => {
    expect(blocksMovement(wallSchema.parse(wall))).toBe(true);
    expect(blocksMovement(wallSchema.parse({ ...wall, kind: "window" }))).toBe(true);
    expect(blocksMovement(wallSchema.parse({ ...wall, kind: "invisible" }))).toBe(true);
    expect(blocksMovement(wallSchema.parse(door))).toBe(true);
    expect(blocksMovement(wallSchema.parse({ ...door, door: "open" }))).toBe(false);
  });

  it("lets players toggle only doors that are not locked", () => {
    expect(canPlayerToggleDoor(wallSchema.parse(door))).toBe(true);
    expect(canPlayerToggleDoor(wallSchema.parse({ ...door, door: "open" }))).toBe(true);
    expect(canPlayerToggleDoor(wallSchema.parse({ ...door, door: "locked" }))).toBe(false);
    expect(canPlayerToggleDoor(wallSchema.parse(wall))).toBe(false);
  });
});

describe("blocksSight", () => {
  it("lets windows, invisible walls and open doors through", () => {
    expect(blocksSight({ id: "w", kind: "wall", points: [0, 0, 1, 1] })).toBe(true);
    expect(blocksSight({ id: "w", kind: "window", points: [0, 0, 1, 1] })).toBe(false);
    expect(blocksSight({ id: "w", kind: "invisible", points: [0, 0, 1, 1] })).toBe(false);
    expect(blocksSight({ id: "d", kind: "door", points: [0, 0, 1, 1], door: "open" })).toBe(false);
    expect(blocksSight({ id: "d", kind: "door", points: [0, 0, 1, 1], door: "locked" })).toBe(true);
  });
});

describe("special sight walls", () => {
  it("blocks movement but not sight on its own", () => {
    for (const kind of ["one-way", "terrain"] as const) {
      const wall = wallSchema.parse({ id: "w", kind, points: [0, 0, 70, 0] });
      expect(blocksMovement(wall)).toBe(true);
      expect(blocksSight(wall)).toBe(false);
    }
  });

  it("tells the side of a segment", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(sideOfSegment(a, b, { x: 5, y: 5 })).toBeGreaterThan(0); // sotto (y verso il basso)
    expect(sideOfSegment(a, b, { x: 5, y: -5 })).toBeLessThan(0);
    expect(sideOfSegment(a, b, { x: 20, y: 0 })).toBe(0);
  });
});
