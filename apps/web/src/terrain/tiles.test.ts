import type { TerrainOp } from "@scryboard/shared";
import { describe, expect, it } from "vitest";
import { planTileUpdate, type TileState, tileResolution, visibleTileCoords } from "./tiles";

const op = (id: string, seq: number, x = 10): TerrainOp => ({
  id,
  seq,
  biome: "grass",
  mode: "paint",
  shape: "brush",
  points: [x, 10],
  width: 10,
});
const bounds = (o: TerrainOp) => ({ x: (o.points[0] as number) - 5, y: 5, width: 10, height: 10 });
const tile = { x: 0, y: 0, width: 100, height: 100 };
const state = (ids: string[], lastSeq: number): TileState => ({ drawn: new Set(ids), lastSeq });

describe("terrain tiles", () => {
  it("picks power-of-two resolutions, rounding up for sharpness", () => {
    expect(tileResolution(1)).toBe(1);
    expect(tileResolution(0.6)).toBe(1);
    expect(tileResolution(0.3)).toBe(0.5);
    expect(tileResolution(5)).toBe(2);
    expect(tileResolution(0.001)).toBe(1 / 32);
  });

  it("lists the tiles covering the visible area", () => {
    expect(visibleTileCoords({ x: -10, y: 0, width: 600, height: 100 }, 1)).toEqual([
      [-1, 0],
      [0, 0],
      [1, 0],
    ]);
  });

  it("draws new strokes on top without redrawing", () => {
    const plan = planTileUpdate(state(["a"], 1), [op("a", 1), op("b", 2)], bounds, tile);
    expect(plan).toEqual({ kind: "incremental", ops: [op("b", 2)] });
  });

  it("redraws the tile after an undo or an out-of-order stroke", () => {
    expect(planTileUpdate(state(["a", "b"], 2), [op("a", 1)], bounds, tile).kind).toBe("full");
    expect(planTileUpdate(state(["b"], 2), [op("a", 1), op("b", 2)], bounds, tile).kind).toBe(
      "full",
    );
  });

  it("ignores strokes elsewhere and clears tiles left empty", () => {
    expect(planTileUpdate(undefined, [op("far", 1, 500)], bounds, tile)).toEqual({ kind: "none" });
    expect(planTileUpdate(state(["a"], 1), [], bounds, tile)).toEqual({ kind: "clear" });
    expect(planTileUpdate(state(["a"], 1), [op("a", 1)], bounds, tile)).toEqual({ kind: "none" });
  });
});
