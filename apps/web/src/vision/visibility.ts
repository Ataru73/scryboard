import { blocksSight, type Wall } from "@scryboard/shared";
import type { Point } from "../board/viewport";

/** Segmenti che fermano la vista, come array piatto [ax, ay, bx, by, ...] (trasferibile al worker). */
export function sightSegments(walls: Iterable<Wall>): Float64Array {
  const out: number[] = [];
  for (const wall of walls) {
    if (!blocksSight(wall)) continue;
    for (let i = 0; i + 3 < wall.points.length; i += 2) {
      out.push(
        wall.points[i] as number,
        wall.points[i + 1] as number,
        wall.points[i + 2] as number,
        wall.points[i + 3] as number,
      );
    }
  }
  return Float64Array.from(out);
}

/** Distanza di "vista illimitata": oltre ogni mappa ragionevole. */
const FAR = 50_000;
const ANGLE_EPSILON = 1e-4;

/**
 * Poligono di ciò che si vede da `origin` (piatto, in ordine di angolo): per ogni estremo dei
 * segmenti vicini si lanciano tre raggi (sull'estremo e appena a fianco, per vedere oltre gli
 * spigoli) e si tiene il primo ostacolo colpito. `radius` > 0 limita l'area (e i segmenti da
 * considerare); il ritaglio circolare vero lo fa chi disegna.
 */
export function visibilityPolygon(origin: Point, segments: Float64Array, radius = 0): number[] {
  const bound = radius > 0 ? radius * 1.05 + 1 : FAR;
  const left = origin.x - bound;
  const right = origin.x + bound;
  const top = origin.y - bound;
  const bottom = origin.y + bound;

  // Segmenti nel riquadro, più i quattro lati del riquadro come ostacoli di riserva.
  const segs: number[] = [
    left,
    top,
    right,
    top,
    right,
    top,
    right,
    bottom,
    right,
    bottom,
    left,
    bottom,
    left,
    bottom,
    left,
    top,
  ];
  for (let i = 0; i < segments.length; i += 4) {
    const ax = segments[i] as number;
    const ay = segments[i + 1] as number;
    const bx = segments[i + 2] as number;
    const by = segments[i + 3] as number;
    if (
      Math.max(ax, bx) < left ||
      Math.min(ax, bx) > right ||
      Math.max(ay, by) < top ||
      Math.min(ay, by) > bottom
    ) {
      continue;
    }
    segs.push(ax, ay, bx, by);
  }

  const angles: number[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < segs.length; i += 2) {
    const x = segs[i] as number;
    const y = segs[i + 1] as number;
    const key = `${Math.round(x * 100)},${Math.round(y * 100)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const a = Math.atan2(y - origin.y, x - origin.x);
    angles.push(a - ANGLE_EPSILON, a, a + ANGLE_EPSILON);
  }
  angles.sort((a, b) => a - b);

  const polygon: number[] = [];
  for (const angle of angles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let nearest = Infinity;
    for (let i = 0; i < segs.length; i += 4) {
      const ax = segs[i] as number;
      const ay = segs[i + 1] as number;
      const sx = (segs[i + 2] as number) - ax;
      const sy = (segs[i + 3] as number) - ay;
      const denominator = dx * sy - dy * sx;
      if (Math.abs(denominator) < 1e-12) continue;
      const qx = ax - origin.x;
      const qy = ay - origin.y;
      const t = (qx * sy - qy * sx) / denominator;
      const u = (qx * dy - qy * dx) / denominator;
      // t > 0 di poco: un'origine appoggiata a un muro non deve vedersi bloccata da esso.
      if (t > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9 && t < nearest) nearest = t;
    }
    if (Number.isFinite(nearest)) polygon.push(origin.x + dx * nearest, origin.y + dy * nearest);
  }
  return polygon;
}

/** Punto nel poligono (pari/dispari). */
export function pointInPolygon(p: Point, polygon: number[]): boolean {
  let inside = false;
  const n = polygon.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i * 2] as number;
    const yi = polygon[i * 2 + 1] as number;
    const xj = polygon[j * 2] as number;
    const yj = polygon[j * 2 + 1] as number;
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
