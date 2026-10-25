import { describe, expect, it } from "vitest";
import {
  centerOn,
  edgeIndicator,
  fitBounds,
  MAX_SCALE,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from "./viewport";

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

  it("can enlarge small content up to the requested maximum", () => {
    const size = { width: 1000, height: 600 };
    const box = { x: 10, y: 10, width: 20, height: 20 };
    expect(fitBounds(box, size, 48, 2).scale).toBe(2);
    // Il contenuto grande resta limitato dallo schermo, non dal massimo.
    const big = { x: 0, y: 0, width: 4000, height: 2000 };
    expect(fitBounds(big, size, 0, 2).scale).toBeCloseTo(0.25);
  });
});

describe("centerOn and edgeIndicator", () => {
  const size = { width: 1000, height: 600 };

  it("puts a world point at the center of the screen", () => {
    const vp = centerOn({ x: 400, y: -200 }, 2, size);
    expect(worldToScreen(vp, { x: 400, y: -200 })).toEqual({ x: 500, y: 300 });
    expect(vp.scale).toBe(2);
  });

  it("has no arrow for visible points", () => {
    expect(edgeIndicator({ x: 100, y: 100 }, size)).toBeNull();
    expect(edgeIndicator({ x: 500, y: 300 }, size)).toBeNull();
  });

  it("points to the edge toward an off-screen point", () => {
    const right = edgeIndicator({ x: 3000, y: 300 }, size, 20);
    expect(right?.position).toEqual({ x: 980, y: 300 });
    expect(right?.angle).toBe(0);
    const below = edgeIndicator({ x: 500, y: 2000 }, size, 20);
    expect(below?.position).toEqual({ x: 500, y: 580 });
    expect(below?.angle).toBe(90);
    const corner = edgeIndicator({ x: -2000, y: -2000 }, size, 20);
    expect(corner?.position.x).toBeGreaterThanOrEqual(20);
    expect(corner?.position.y).toBeGreaterThanOrEqual(20);
    expect(Math.round(corner?.angle ?? 0)).toBe(-137);
  });
});
