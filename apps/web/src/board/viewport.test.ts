import { describe, expect, it } from "vitest";
import { fitBounds, MAX_SCALE, screenToWorld, worldToScreen, zoomAt } from "./viewport";

describe("viewport", () => {
  const vp = { x: 100, y: 50, scale: 2 };

  it("converts between screen and world coordinates", () => {
    const world = screenToWorld(vp, { x: 300, y: 250 });
    expect(world).toEqual({ x: 100, y: 100 });
    expect(worldToScreen(vp, world)).toEqual({ x: 300, y: 250 });
  });

  it("keeps the anchor point fixed while zooming", () => {
    const anchor = { x: 400, y: 300 };
    const before = screenToWorld(vp, anchor);
    const zoomed = zoomAt(vp, anchor, 1.5);
    expect(zoomed.scale).toBe(3);
    const after = screenToWorld(zoomed, anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("clamps the zoom level", () => {
    expect(zoomAt(vp, { x: 0, y: 0 }, 1000).scale).toBe(MAX_SCALE);
  });

  it("fits bounds into the screen without upscaling small content", () => {
    const big = fitBounds(
      { x: 0, y: 0, width: 4000, height: 2000 },
      { width: 1000, height: 600 },
      0,
    );
    expect(big.scale).toBeCloseTo(0.25);
    expect(screenToWorld(big, { x: 500, y: 300 })).toEqual({ x: 2000, y: 1000 });

    const small = fitBounds({ x: 10, y: 10, width: 20, height: 20 }, { width: 1000, height: 600 });
    expect(small.scale).toBe(1);
  });
});
