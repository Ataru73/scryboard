import { DEFAULT_GRID, type GridSettings, type TokenItem } from "@scryboard/shared";
import { describe, expect, it } from "vitest";
import {
  formatDistance,
  formatElevation,
  measureRise,
  pathCells,
  segmentCells,
  snapRulerPoint,
  squareDistance,
  withRise,
} from "./measure";

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

describe("elevation", () => {
  const token = (col: number, row: number, elevation?: number) =>
    ({ kind: "token", size: 1, ...at(col, row), elevation }) as TokenItem;
  const grid = { ...square, scale: { amount: 5, unit: "ft" } };

  it("measures the rise between the tokens at the ends, or the ground", () => {
    const tokens = [token(0, 0), token(4, 0, 15)];
    expect(measureRise([at(0, 0), at(4, 0)], tokens, grid)).toBe(3);
    expect(measureRise([at(4, 0), at(2, 2), at(0, 0)], tokens, grid)).toBe(-3);
    // Un punto senza token è a terra.
    expect(measureRise([at(4, 0), at(9, 9)], tokens, grid)).toBe(-3);
    expect(measureRise([at(1, 1), at(9, 9)], tokens, grid)).toBe(0);
  });

  it("adds the rise with the grid's diagonal rule, or in a straight line", () => {
    expect(withRise(4, 3, grid)).toBe(4);
    expect(withRise(4, -3, { ...grid, diagonals: "alternate" })).toBe(5);
    expect(withRise(4, 3, { ...grid, enabled: false })).toBe(5);
    expect(withRise(4, 3, { ...grid, type: "hex-flat" })).toBe(5);
    expect(withRise(4, 0, grid)).toBe(4);
  });

  it("formats the elevation with sign and unit", () => {
    expect(formatElevation(15, grid)).toBe("+15 ft");
    expect(formatElevation(-2.5, { ...grid, scale: { amount: 1.5, unit: "m" } })).toBe("-2.5 m");
    expect(formatElevation(3, { ...grid, scale: { amount: 1, unit: "" } })).toBe("+3");
  });
});
