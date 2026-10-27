import { describe, expect, it } from "vitest";
import {
  addLaserPoint,
  LASER_SENT_POINTS,
  LASER_TRAIL_MS,
  LaserTrail,
  parseLaserState,
} from "./laser";

describe("addLaserPoint", () => {
  it("keeps only the latest points, counting the dropped ones", () => {
    let state = { id: "s", start: 0, points: [] as number[] };
    for (let i = 0; i < LASER_SENT_POINTS + 3; i++) state = addLaserPoint(state, i, -i);
    expect(state.start).toBe(3);
    expect(state.points.length).toBe(LASER_SENT_POINTS * 2);
    expect(state.points.slice(0, 2)).toEqual([3, -3]);
  });
});

describe("LaserTrail", () => {
  it("adds only new points, even when a state is repeated or skipped", () => {
    const trail = new LaserTrail();
    trail.ingest({ id: "s", start: 0, points: [0, 0, 1, 1] }, 0);
    trail.ingest({ id: "s", start: 0, points: [0, 0, 1, 1, 2, 2] }, 10);
    trail.ingest({ id: "s", start: 2, points: [2, 2, 3, 3, 4, 4] }, 20);
    expect(trail.points.map((p) => [p.x, p.at])).toEqual([
      [0, 0],
      [1, 0],
      [2, 10],
      [3, 20],
      [4, 20],
    ]);
  });

  it("starts a separate stroke and lets old points fade", () => {
    const trail = new LaserTrail();
    trail.ingest({ id: "a", start: 5, points: [0, 0, 1, 1] }, 0);
    trail.ingest({ id: "b", start: 0, points: [9, 9] }, 500);
    expect(trail.points.map((p) => p.stroke)).toEqual(["a", "a", "b"]);
    expect(trail.prune(LASER_TRAIL_MS + 1)).toBe(true);
    expect(trail.points.map((p) => p.stroke)).toEqual(["b"]);
    expect(trail.prune(LASER_TRAIL_MS + 501)).toBe(false);
  });
});

describe("parseLaserState", () => {
  it("accepts well-formed states only", () => {
    expect(parseLaserState({ id: "s", start: 2, points: [1, 2] })).toEqual({
      id: "s",
      start: 2,
      points: [1, 2],
    });
    expect(parseLaserState(null)).toBeNull();
    expect(parseLaserState({ id: "s", start: -1, points: [] })).toBeNull();
    expect(parseLaserState({ id: "s", start: 0, points: [1] })).toBeNull();
    expect(parseLaserState({ id: "s", start: 0, points: [1, "2"] })).toBeNull();
    expect(
      parseLaserState({ id: "s", start: 0, points: new Array(LASER_SENT_POINTS * 2 + 2).fill(0) }),
    ).toBeNull();
  });
});
