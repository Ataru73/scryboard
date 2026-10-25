import { DEFAULT_GRID, type GridSettings } from "@scryboard/shared";
import { describe, expect, it } from "vitest";
import {
  type TemplateGeometry,
  templateCells,
  templateContains,
  templateFromDrag,
  templateLabel,
} from "./areas";

const grid: GridSettings = { ...DEFAULT_GRID, enabled: true, size: 50, offsetX: 0, offsetY: 0 };
const base = { x: 0, y: 0, rotation: 0 };

describe("templateContains", () => {
  it("handles circles", () => {
    const t: TemplateGeometry = { ...base, shape: "circle", size: 2 };
    expect(templateContains(t, { x: 99, y: 0 }, 50)).toBe(true);
    expect(templateContains(t, { x: 71, y: 71 }, 50)).toBe(false);
  });

  it("opens cones as wide as they are long, along the direction", () => {
    const t: TemplateGeometry = { ...base, shape: "cone", size: 4 };
    expect(templateContains(t, { x: 200, y: 99 }, 50)).toBe(true);
    expect(templateContains(t, { x: 200, y: 101 }, 50)).toBe(false);
    expect(templateContains(t, { x: -1, y: 0 }, 50)).toBe(false);
    const down = { ...t, rotation: 90 };
    expect(templateContains(down, { x: 0, y: 150 }, 50)).toBe(true);
    expect(templateContains(down, { x: 150, y: 0 }, 50)).toBe(false);
  });

  it("handles cubes and lines", () => {
    const cube: TemplateGeometry = { ...base, shape: "cube", size: 2 };
    expect(templateContains(cube, { x: 99, y: 49 }, 50)).toBe(true);
    expect(templateContains(cube, { x: 99, y: 51 }, 50)).toBe(false);
    const line: TemplateGeometry = { ...base, shape: "line", size: 6, width: 2 };
    expect(templateContains(line, { x: 299, y: 50 }, 50)).toBe(true);
    expect(templateContains(line, { x: 299, y: 51 }, 50)).toBe(false);
  });
});

describe("templateCells", () => {
  it("selects cells by their center on a square grid", () => {
    // Cerchio di 1 casella attorno a un incrocio: le quattro caselle vicine.
    const cells = templateCells({ ...base, shape: "circle", size: 1 }, grid);
    expect(cells).toHaveLength(4);
    // Cubo di 2 caselle accanto all'origine: 2 colonne × 2 righe.
    expect(templateCells({ ...base, y: 50, shape: "cube", size: 2 }, grid)).toHaveLength(4);
  });

  it("returns nothing without a grid and works on hexes", () => {
    expect(
      templateCells({ ...base, shape: "circle", size: 2 }, { ...grid, enabled: false }),
    ).toEqual([]);
    const hex: GridSettings = { ...grid, type: "hex-pointy" };
    const cells = templateCells({ ...base, shape: "circle", size: 1.2 }, hex);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => c.corners.length === 6)).toBe(true);
  });
});

describe("templateFromDrag", () => {
  it("snaps origin, direction and length on the grid", () => {
    const t = templateFromDrag("cone", { x: 52, y: 48 }, { x: 200, y: 200 }, grid, false);
    expect(t).toMatchObject({ x: 50, y: 50, rotation: 45, size: 4 });
  });

  it("is free with Alt", () => {
    const t = templateFromDrag("line", { x: 52, y: 48 }, { x: 152, y: 48 }, grid, true);
    expect(t).toMatchObject({ x: 52, y: 48, rotation: 0, size: 2 });
  });
});

describe("templateLabel", () => {
  it("uses the grid scale", () => {
    expect(templateLabel({ ...base, shape: "circle", size: 4 }, grid)).toBe("Cerchio 20 ft");
  });
});
