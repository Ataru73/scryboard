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

/**
 * Trasformazione durante un pinch-to-zoom combinato con pan (gesto a 2 dita).
 * Mantiene il punto del mondo sotto `startCenter` esattamente sotto `currentCenter`.
 */
export function pinchTransform(
  startVp: Viewport,
  startDistance: number,
  currentDistance: number,
  startCenter: Point,
  currentCenter: Point,
): Viewport {
  if (startDistance <= 0 || currentDistance <= 0) return startVp;
  const factor = currentDistance / startDistance;
  const scale = clampScale(startVp.scale * factor);
  const world = screenToWorld(startVp, startCenter);
  return {
    scale,
    x: currentCenter.x - world.x * scale,
    y: currentCenter.y - world.y * scale,
  };
}

/** Viewport che mette al centro di uno schermo `size` il punto del mondo `point`. */
export function centerOn(
  point: Point,
  scale: number,
  size: { width: number; height: number },
): Viewport {
  const s = clampScale(scale);
  return { scale: s, x: size.width / 2 - point.x * s, y: size.height / 2 - point.y * s };
}

/**
 * Per un punto fuori dallo schermo: dove mettere la freccia sul bordo (a `margin` pixel) e in che
 * direzione punta, in gradi. `null` se il punto è già visibile.
 */
export function edgeIndicator(
  screen: Point,
  size: { width: number; height: number },
  margin = 28,
): { position: Point; angle: number } | null {
  const halfW = size.width / 2 - margin;
  const halfH = size.height / 2 - margin;
  const dx = screen.x - size.width / 2;
  const dy = screen.y - size.height / 2;
  if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) return null;
  const t = Math.min(
    dx === 0 ? Infinity : halfW / Math.abs(dx),
    dy === 0 ? Infinity : halfH / Math.abs(dy),
  );
  return {
    position: { x: size.width / 2 + dx * t, y: size.height / 2 + dy * t },
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

/** Viewport che mostra `bounds` centrato in uno schermo `size`, senza ingrandire oltre il 100%. */
export function fitBounds(
  bounds: Box,
  size: { width: number; height: number },
  padding = 48,
  /** Ingrandimento massimo: 1 evita di ingrandire il contenuto piccolo. */
  maxScale = 1,
): Viewport {
  const availW = Math.max(1, size.width - padding * 2);
  const availH = Math.max(1, size.height - padding * 2);
  const scale = clampScale(
    Math.min(maxScale, availW / Math.max(1, bounds.width), availH / Math.max(1, bounds.height)),
  );
  return {
    scale,
    x: size.width / 2 - (bounds.x + bounds.width / 2) * scale,
    y: size.height / 2 - (bounds.y + bounds.height / 2) * scale,
  };
}
