import { describe, expect, it } from "vitest";
import { clampCrop, cropRegion, initialCrop, panCrop, zoomCrop } from "./crop";

describe("token image crop", () => {
  it("starts on the central square", () => {
    const crop = initialCrop(400, 200);
    expect(cropRegion(400, 200, crop)).toEqual({ x: 100, y: 0, side: 200 });
  });

  it("stays inside the image and within the zoom limits", () => {
    const clamped = clampCrop(400, 200, { zoom: 10, cx: -50, cy: 999 });
    expect(clamped.zoom).toBe(5);
    const { x, y, side } = cropRegion(400, 200, clamped);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + side).toBeLessThanOrEqual(400);
    expect(y + side).toBeLessThanOrEqual(200);
    expect(clampCrop(400, 200, { zoom: 0.2, cx: 200, cy: 100 }).zoom).toBe(1);
  });

  it("pans opposite to the drag, scaled to the preview", () => {
    const zoomed = { zoom: 2, cx: 200, cy: 100 }; // side 100 px on a 300 px preview
    const moved = panCrop(400, 200, zoomed, 30, 0, 300);
    expect(moved.cx).toBeCloseTo(190); // 30 preview px = 10 source px, towards the left
    expect(moved.cy).toBe(100);
    // Without zoom on a wide image the vertical position cannot move at all.
    expect(panCrop(400, 200, initialCrop(400, 200), 0, 50, 300).cy).toBe(100);
  });

  it("zooms around the centre or around an anchor point", () => {
    const centred = zoomCrop(400, 200, initialCrop(400, 200), 2);
    expect(centred).toEqual({ zoom: 2, cx: 200, cy: 100 });
    // Zooming on the right edge of the preview keeps that edge where it was.
    const anchored = zoomCrop(400, 200, initialCrop(400, 200), 2, { x: 1, y: 0.5 });
    expect(cropRegion(400, 200, anchored).x + cropRegion(400, 200, anchored).side).toBeCloseTo(300);
  });
});
