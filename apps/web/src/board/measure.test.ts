import { DEFAULT_GRID, type GridSettings } from "@scryboard/shared";
import { describe, expect, it } from "vitest";
import { formatDistance, pathCells, segmentCells, snapRulerPoint, squareDistance } from "./measure";

const square: GridSettings = { ...DEFAULT_GRID, enabled: true, size: 50, offsetX: 0, offsetY: 0 };
const at = (col: number, row: number) => ({ x: col * 50 + 25, y: row * 50 + 25 });

describe("squareDistance", () => {
  it("counts diagonals according to the rule", () => {
    expect(squareDistance(3, 3, "one")).toBe(3);
    expect(squareDistance(3, 3, "alternate")).toBe(4);
    expect(squareDistance(4, 4, "alternate")).toBe(6);
    expect(squareDistance(3, 4, "euclid")).toBe(5);
    expect(squareDistance(-6, 2, "one")).toBe(6);
  });
});

describe("segmentCells", () => {
  it("measures between cells, not pixels", () => {
    // Stesse caselle anche se i punti non sono al centro.
    expect(segmentCells({ x: 1, y: 1 }, { x: 249, y: 49 }, square)).toBe(4);
    expect(segmentCells(at(0, 0), at(4, 2), { ...square, diagonals: "alternate" })).toBe(5);
  });

  it("uses pixels when the grid is off", () => {
    expect(segmentCells({ x: 0, y: 0 }, { x: 150, y: 200 }, { ...square, enabled: false })).toBe(5);
  });

  it("uses cube distance on hex grids", () => {
    const hex: GridSettings = { ...square, type: "hex-pointy", size: 50, diagonals: "euclid" };
    // Due esagoni vicini sulla stessa riga distano `size` pixel.
    expect(segmentCells({ x: 0, y: 0 }, { x: 150, y: 0 }, hex)).toBe(3);
    expect(segmentCells({ x: 0, y: 0 }, { x: 0, y: 0 }, hex)).toBe(0);
  });
});

describe("pathCells", () => {
  it("sums the legs", () => {
    expect(pathCells([at(0, 0), at(3, 0), at(3, 2)], square)).toBe(5);
    expect(pathCells([at(0, 0)], square)).toBe(0);
  });
});

describe("snapRulerPoint", () => {
  it("snaps to cell centers unless free", () => {
    expect(snapRulerPoint({ x: 60, y: 10 }, square, false)).toEqual({ x: 75, y: 25 });
    expect(snapRulerPoint({ x: 60, y: 10 }, square, true)).toEqual({ x: 60, y: 10 });
  });
});

describe("formatDistance", () => {
  it("applies the scale", () => {
    expect(formatDistance(6, square)).toBe("30 ft · 6 caselle");
    expect(formatDistance(1, { ...square, scale: { amount: 1.5, unit: "m" } })).toBe(
      "1.5 m · 1 casella",
    );
  });
});
