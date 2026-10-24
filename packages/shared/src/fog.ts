import type { FogOp } from "./board";

type Pt = { x: number; y: number };

/** Spessore predefinito del pennello della nebbia, lo stesso usato per disegnarla. */
export const DEFAULT_FOG_BRUSH = 40;

function inRect(p: Pt, points: number[]): boolean {
  const [x = 0, y = 0, w = 0, h = 0] = points;
  return (
    p.x >= Math.min(x, x + w) &&
    p.x <= Math.max(x, x + w) &&
    p.y >= Math.min(y, y + h) &&
    p.y <= Math.max(y, y + h)
  );
}

/** Punto nel poligono (pari/dispari). */
function inPolygon(p: Pt, points: number[]): boolean {
  let inside = false;
  const n = points.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i * 2] as number;
    const yi = points[i * 2 + 1] as number;
    const xj = points[j * 2] as number;
    const yj = points[j * 2 + 1] as number;
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function nearPolyline(p: Pt, points: number[], radius: number): boolean {
  if (points.length === 2)
    return Math.hypot(p.x - (points[0] as number), p.y - (points[1] as number)) <= radius;
  for (let i = 0; i + 3 < points.length; i += 2) {
    const ax = points[i] as number;
    const ay = points[i + 1] as number;
    const dx = (points[i + 2] as number) - ax;
    const dy = (points[i + 3] as number) - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / len2));
    if (Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy)) <= radius) return true;
  }
  return false;
}

function contains(op: FogOp, p: Pt): boolean {
  switch (op.shape) {
    case "all":
      return true;
    case "rect":
      return inRect(p, op.points);
    case "polygon":
      return inPolygon(p, op.points);
    case "brush":
      return nearPolyline(p, op.points, (op.width ?? DEFAULT_FOG_BRUSH) / 2);
  }
}

/**
 * Il punto è coperto dalla nebbia? Le operazioni vanno passate in ordine di `seq`: l'ultima che
 * contiene il punto decide (copre o scopre), come nel disegno.
 */
export function isFogged(p: Pt, ops: FogOp[]): boolean {
  let fogged = false;
  for (const op of ops) if (contains(op, p)) fogged = op.mode === "cover";
  return fogged;
}

/** Ordina le operazioni di nebbia come le applica il disegno. */
export function sortFogOps(ops: FogOp[]): FogOp[] {
  return [...ops].sort((a, b) => a.seq - b.seq || (a.id < b.id ? -1 : 1));
}
