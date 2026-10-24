export interface Viewport {
  /** Trasformazione schermo = mondo × scale + (x, y). */
  x: number;
  y: number;
  scale: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 8;

export const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

export function screenToWorld(vp: Viewport, p: Point): Point {
  return { x: (p.x - vp.x) / vp.scale, y: (p.y - vp.y) / vp.scale };
}

export function worldToScreen(vp: Viewport, p: Point): Point {
  return { x: p.x * vp.scale + vp.x, y: p.y * vp.scale + vp.y };
}

/** Zoom mantenendo fermo il punto dello schermo `anchor` (es. il puntatore). */
export function zoomAt(vp: Viewport, anchor: Point, factor: number): Viewport {
  const scale = clampScale(vp.scale * factor);
  const world = screenToWorld(vp, anchor);
  return { scale, x: anchor.x - world.x * scale, y: anchor.y - world.y * scale };
}

/** Viewport che mostra `bounds` centrato in uno schermo `size`, senza ingrandire oltre il 100%. */
export function fitBounds(
  bounds: Box,
  size: { width: number; height: number },
  padding = 48,
): Viewport {
  const availW = Math.max(1, size.width - padding * 2);
  const availH = Math.max(1, size.height - padding * 2);
  const scale = clampScale(
    Math.min(1, availW / Math.max(1, bounds.width), availH / Math.max(1, bounds.height)),
  );
  return {
    scale,
    x: size.width / 2 - (bounds.x + bounds.width / 2) * scale,
    y: size.height / 2 - (bounds.y + bounds.height / 2) * scale,
  };
}
