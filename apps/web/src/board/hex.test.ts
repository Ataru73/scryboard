import { DEFAULT_GRID, type GridSettings } from "@scryboard/shared";
import { describe, expect, it } from "vitest";
import {
  hexCorners,
  hexOffsetCoords,
  hexToPixel,
  nearestHexCorner,
  normalizeHexOffset,
  pixelToHex,
  visibleHexes,
} from "./hex";

const pointy: GridSettings = {
  ...DEFAULT_GRID,
  enabled: true,
  type: "hex-pointy",
  size: 60,
  offsetX: 10,
  offsetY: 20,
};
const flat: GridSettings = { ...pointy, type: "hex-flat" };

describe("hex grids", () => {
  it.each([pointy, flat])("round-trips centres and finds the hex under a point (%s)", (grid) => {
    for (const h of [
      { q: 0, r: 0 },
      { q: 3, r: -2 },
      { q: -4, r: 5 },
    ]) {
      const c = hexToPixel(h, grid);
      expect(pixelToHex(c, grid)).toEqual(h);
      // Un punto vicino al centro (entro metà della distanza tra lati) resta nello stesso esagono.
      expect(pixelToHex({ x: c.x + 20, y: c.y - 15 }, grid)).toEqual(h);
    }
  });

  it("spaces neighbouring centres by the flat-to-flat size", () => {
    const a = hexToPixel({ q: 0, r: 0 }, pointy);
    const b = hexToPixel({ q: 1, r: 0 }, pointy);
    const c = hexToPixel({ q: 0, r: 1 }, pointy);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(60);
    expect(Math.hypot(c.x - a.x, c.y - a.y)).toBeCloseTo(60);
  });

  it("places corners at the hex radius, pointy hexes with a vertex on top", () => {
    const corners = hexCorners({ q: 0, r: 0 }, pointy);
    const R = 60 / Math.sqrt(3);
    for (const p of corners) expect(Math.hypot(p.x - 10, p.y - 20)).toBeCloseTo(R);
    expect(Math.min(...corners.map((p) => p.y))).toBeCloseTo(20 - R);
    const flatCorners = hexCorners({ q: 0, r: 0 }, flat);
    expect(Math.max(...flatCorners.map((p) => p.x))).toBeCloseTo(10 + R);
  });

  it("labels hexes with offset columns and rows", () => {
    expect(hexOffsetCoords({ q: 0, r: 0 }, pointy)).toEqual({ col: 0, row: 0 });
    expect(hexOffsetCoords({ q: -1, r: 2 }, pointy)).toEqual({ col: 0, row: 2 });
    expect(hexOffsetCoords({ q: 2, r: -1 }, flat)).toEqual({ col: 2, row: 0 });
  });

  it("snaps to the nearest corner", () => {
    const corner = hexCorners({ q: 2, r: 1 }, pointy)[1] as { x: number; y: number };
    const snapped = nearestHexCorner({ x: corner.x + 3, y: corner.y - 2 }, pointy);
    expect(snapped.x).toBeCloseTo(corner.x);
    expect(snapped.y).toBeCloseTo(corner.y);
  });

  it("lists the hexes covering the view", () => {
    const hexes = visibleHexes(
      { ...pointy, offsetX: 0, offsetY: 0 },
      { x: 0, y: 0, width: 300, height: 200 },
    );
    expect(hexes.length).toBeGreaterThan(15);
    expect(hexes).toContainEqual({ q: 0, r: 0 });
  });

  it("reduces offsets to the grid period without moving the grid", () => {
    // Periodo della griglia a punta: una colonna in orizzontale, due righe (3 raggi) in verticale.
    const twoRows = (3 * 60) / Math.sqrt(3);
    const shifted = { ...pointy, offsetX: 10 + 60 * 3, offsetY: 20 - twoRows * 2 };
    const normal = { ...pointy, ...normalizeHexOffset(shifted) };
    const p = { x: 123, y: 77 };
    const a = hexToPixel(pixelToHex(p, normal), normal);
    const b = hexToPixel(pixelToHex(p, pointy), pointy);
    expect(a.x).toBeCloseTo(b.x, 1);
    expect(a.y).toBeCloseTo(b.y, 1);
  });
});
