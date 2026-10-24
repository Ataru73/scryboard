import { describe, expect, it } from "vitest";
import { dilate, floodFill } from "./fill";

/** Raster 6×5: un quadrato di 1 (bordo) attorno a una zona di 0, il resto 0 aperto. */
const W = 6;
const H = 5;
const grid = (rows: string[]) => Uint8Array.from(rows.join("").split("").map(Number));

describe("flood fill", () => {
  it("fills the enclosed region and knows it is closed", () => {
    const labels = grid(["000000", "011110", "010010", "011110", "000000"]);
    const { mask, touchesBorder, count } = floodFill(labels, W, H, 2, 2);
    expect(touchesBorder).toBe(false);
    expect(count).toBe(2);
    expect(mask[2 * W + 2]).toBe(1);
    expect(mask[2 * W + 3]).toBe(1);
    expect(mask[0]).toBe(0);
  });

  it("detects open areas reaching the border", () => {
    const labels = grid(["000000", "011110", "010000", "011110", "000000"]);
    expect(floodFill(labels, W, H, 2, 2).touchesBorder).toBe(true);
  });

  it("grows a mask by one pixel", () => {
    const mask = new Uint8Array(W * H);
    mask[2 * W + 2] = 1;
    const grown = dilate(mask, W, H);
    expect([grown[2 * W + 1], grown[2 * W + 3], grown[1 * W + 2], grown[3 * W + 2]]).toEqual([
      255, 255, 255, 255,
    ]);
    expect(grown[1 * W + 1]).toBe(0);
  });
});
