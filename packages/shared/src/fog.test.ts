import { describe, expect, it } from "vitest";
import type { FogOp } from "./board";
import { isFogged, sortFogOps } from "./fog";

let seq = 0;
const op = (
  mode: FogOp["mode"],
  shape: FogOp["shape"],
  points: number[] = [],
  width?: number,
): FogOp => ({
  id: `op${++seq}`,
  seq,
  mode,
  shape,
  points,
  width,
});

describe("isFogged", () => {
  it("is clear without fog and covered by 'cover all'", () => {
    expect(isFogged({ x: 5, y: 5 }, [])).toBe(false);
    expect(isFogged({ x: 5, y: 5 }, [op("cover", "all")])).toBe(true);
  });

  it("lets the last operation containing the point decide", () => {
    const ops = [op("cover", "all"), op("reveal", "rect", [0, 0, 100, 100])];
    expect(isFogged({ x: 50, y: 50 }, ops)).toBe(false);
    expect(isFogged({ x: 150, y: 50 }, ops)).toBe(true);
    expect(isFogged({ x: 50, y: 50 }, [...ops, op("cover", "brush", [40, 0, 40, 100], 30)])).toBe(
      true,
    );
  });

  it("handles polygons, negative rects and brush width", () => {
    const triangle = op("cover", "polygon", [0, 0, 100, 0, 50, 100]);
    expect(isFogged({ x: 50, y: 30 }, [triangle])).toBe(true);
    expect(isFogged({ x: 5, y: 90 }, [triangle])).toBe(false);
    expect(isFogged({ x: -50, y: -50 }, [op("cover", "rect", [0, 0, -100, -100])])).toBe(true);
    expect(isFogged({ x: 0, y: 25 }, [op("cover", "brush", [0, 0, 100, 0], 40)])).toBe(false);
    expect(isFogged({ x: 0, y: 15 }, [op("cover", "brush", [0, 0, 100, 0], 40)])).toBe(true);
  });

  it("sorts operations by seq", () => {
    const a = op("cover", "all");
    const b = op("reveal", "all");
    expect(sortFogOps([b, a]).map((o) => o.id)).toEqual([a.id, b.id]);
  });
});
