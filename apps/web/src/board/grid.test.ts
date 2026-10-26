import { DEFAULT_GRID } from "@scryboard/shared";
import { describe, expect, it } from "vitest";
import {
  calibrateFromBox,
  cellAt,
  duplicateTokenName,
  nextTokenName,
  normalizeOffset,
  snapGridCorner,
  snapTokenCenter,
  tokenInitials,
  visibleGridLines,
} from "./grid";

const grid = { ...DEFAULT_GRID, enabled: true, size: 50, offsetX: 10, offsetY: 20 };

describe("grid", () => {
  it("snaps odd-sized tokens to cell centres", () => {
    expect(snapTokenCenter({ x: 40, y: 40 }, 1, grid)).toEqual({ x: 35, y: 45 });
    expect(snapTokenCenter({ x: 70, y: 99 }, 3, grid)).toEqual({ x: 85, y: 95 });
    expect(snapTokenCenter({ x: 12, y: 30 }, 0.5, grid)).toEqual({ x: 35, y: 45 });
  });

  it("snaps even-sized tokens to grid intersections", () => {
    expect(snapTokenCenter({ x: 50, y: 60 }, 2, grid)).toEqual({ x: 60, y: 70 });
    expect(snapTokenCenter({ x: -30, y: -25 }, 4, grid)).toEqual({ x: -40, y: -30 });
  });

  it("snaps wall vertices to grid corners, including negative coordinates", () => {
    expect(snapGridCorner({ x: 34, y: 44 }, grid)).toEqual({ x: 10, y: 20 });
    expect(snapGridCorner({ x: 35, y: 45 }, grid)).toEqual({ x: 60, y: 70 });
    expect(snapGridCorner({ x: -16, y: -6 }, grid)).toEqual({ x: -40, y: -30 });
    expect(snapGridCorner({ x: 35, y: 45 }, { ...grid, enabled: false })).toEqual({ x: 60, y: 70 });
  });

  it("finds the cell under a point", () => {
    expect(cellAt({ x: 10, y: 20 }, grid)).toEqual({ col: 0, row: 0 });
    expect(cellAt({ x: 59.9, y: 69.9 }, grid)).toEqual({ col: 0, row: 0 });
    expect(cellAt({ x: 9, y: 19 }, grid)).toEqual({ col: -1, row: -1 });
  });

  it("calibrates from a box drawn over one cell", () => {
    expect(calibrateFromBox({ x: 130, y: 245, width: 72, height: 68 })).toEqual({
      size: 70,
      offsetX: 60,
      offsetY: 35,
    });
    expect(calibrateFromBox({ x: 0, y: 0, width: 4, height: 4 })).toBeNull();
  });

  it("normalizes offsets into [0, size)", () => {
    expect(normalizeOffset(-5, 50)).toBe(45);
    expect(normalizeOffset(120, 50)).toBe(20);
  });

  it("lists only the visible lines, or none when cells are tiny", () => {
    expect(visibleGridLines(grid, { x: 0, y: 0, width: 120, height: 80 }, 1)).toEqual({
      xs: [10, 60, 110],
      ys: [20, 70],
    });
    expect(visibleGridLines(grid, { x: 0, y: 0, width: 100, height: 100 }, 0.1)).toBeNull();
  });

  it("builds initials", () => {
    expect(tokenInitials("Goblin arciere")).toBe("GA");
    expect(tokenInitials("thorin")).toBe("TH");
    expect(tokenInitials("  ")).toBe("?");
  });

  it("numbers duplicate token names", () => {
    expect(nextTokenName("Goblin", [])).toBe("Goblin");
    expect(nextTokenName("Goblin", ["Goblin", "Goblin 2"])).toBe("Goblin 3");
    expect(nextTokenName("  ", ["x"])).toBe("");
  });

  it("numbers copies of numbered tokens from their base name", () => {
    expect(duplicateTokenName("Goblin", ["Goblin"])).toBe("Goblin 2");
    expect(duplicateTokenName("Goblin 2", ["Goblin", "Goblin 2"])).toBe("Goblin 3");
    expect(duplicateTokenName("Agente 47", ["Agente 47"])).toBe("Agente 47 2");
    expect(duplicateTokenName("", [""])).toBe("");
  });
});

describe("grid functions on hex grids", () => {
  const hex = {
    ...DEFAULT_GRID,
    enabled: true,
    type: "hex-pointy" as const,
    size: 60,
    offsetX: 0,
    offsetY: 0,
  };

  it("snaps tokens to hex centres of any size and walls to hex corners", () => {
    expect(snapTokenCenter({ x: 55, y: 8 }, 2, hex)).toEqual({ x: 60, y: 0 });
    const corner = snapGridCorner({ x: 1, y: -33 }, hex);
    expect(corner.x).toBeCloseTo(0);
    expect(corner.y).toBeCloseTo(-60 / Math.sqrt(3));
  });

  it("labels cells with hex offset coordinates", () => {
    expect(cellAt({ x: 60, y: 0 }, hex)).toEqual({ col: 1, row: 0 });
  });

  it("calibrates a hex grid from a box around one hex", () => {
    // Esagono a punta da 70: largo 70, alto 70 · 2/√3 ≈ 80,8, centrato in (200, 300).
    const h = (70 * 2) / Math.sqrt(3);
    const cal = calibrateFromBox({ x: 165, y: 300 - h / 2, width: 70, height: h }, "hex-pointy");
    expect(cal?.size).toBe(70);
    const grid = { ...hex, ...cal } as typeof hex;
    expect(snapTokenCenter({ x: 203, y: 297 }, 1, grid).x).toBeCloseTo(200, 0);
    expect(snapTokenCenter({ x: 203, y: 297 }, 1, grid).y).toBeCloseTo(300, 0);
  });
});
