import { describe, expect, it } from "vitest";
import { hashString, noise1d, seededRandom, tileableFbm, tileableNoise } from "./noise";

describe("noise", () => {
  it("is deterministic for a given seed", () => {
    expect(seededRandom(42)()).toBe(seededRandom(42)());
    expect(seededRandom(42)()).not.toBe(seededRandom(43)());
    expect(hashString("grass")).toBe(hashString("grass"));
    expect(hashString("grass")).not.toBe(hashString("sand"));
  });

  it("repeats seamlessly every period", () => {
    const n = tileableNoise(7, 8);
    const f = tileableFbm(7, 4, 4);
    for (const [x, y] of [
      [0.3, 0.7],
      [2.5, 3.1],
      [7.9, 0.01],
    ] as const) {
      expect(n(x + 8, y)).toBeCloseTo(n(x, y), 10);
      expect(n(x, y + 8)).toBeCloseTo(n(x, y), 10);
      expect(f(x + 4, y)).toBeCloseTo(f(x, y), 10);
      expect(f(x, y + 4)).toBeCloseTo(f(x, y), 10);
    }
  });

  it("stays within [0, 1] and [-1, 1]", () => {
    const f = tileableFbm(3, 4, 5);
    const g = noise1d(3);
    for (let i = 0; i < 500; i++) {
      const v = f(i * 0.137, i * 0.071);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(Math.abs(g(i * 0.31))).toBeLessThanOrEqual(1);
    }
  });
});
