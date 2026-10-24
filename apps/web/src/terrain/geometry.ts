import type { TerrainOp } from "@scryboard/shared";
import type { Box } from "../board/viewport";
import { hashString, noise1d } from "./noise";

type Pt = [number, number];

const toPairs = (flat: number[]): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i] as number, flat[i + 1] as number]);
  return out;
};
const toFlat = (pairs: Pt[]) => pairs.flat();

function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Semplifica un tracciato (Ramer–Douglas–Peucker) togliendo i punti entro `tolerance`. */
export function simplify(points: number[], tolerance: number): number[] {
  const pts = toPairs(points);
  if (pts.length <= 2) return points.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop() as [number, number];
    let maxDist = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = distanceToSegment(pts[i] as Pt, pts[start] as Pt, pts[end] as Pt);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index !== -1 && maxDist > tolerance) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return toFlat(pts.filter((_, i) => keep[i]));
}

/** Smussa un poligono chiuso tagliando gli angoli (Chaikin). */
export function chaikinClosed(points: number[], iterations: number): number[] {
  let pts = toPairs(points);
  for (let k = 0; k < iterations; k++) {
    const next: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i] as Pt;
      const b = pts[(i + 1) % pts.length] as Pt;
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    pts = next;
  }
  return toFlat(pts);
}

/**
 * Cerchi che compongono una pennellata: uno ogni terzo di raggio lungo il tracciato, con il raggio
 * che oscilla un po' (rumore deterministico dall'id) per bordi naturali e non da pennarello.
 */
export function brushCircles(
  op: Pick<TerrainOp, "id" | "points" | "width">,
): [number, number, number][] {
  const radius = (op.width ?? 40) / 2;
  const seed = hashString(op.id);
  const slow = noise1d(seed);
  const fast = noise1d(seed ^ 0x5bd1e995);
  // Due frequenze: ondulazione ampia più piccole irregolarità.
  const wobble = (t: number) => 0.7 * slow(t) + 0.3 * fast(t * 4);
  const step = Math.max(1, radius / 3);
  const pts = toPairs(op.points);
  const circles: [number, number, number][] = [];
  let travelled = 0;
  const push = (x: number, y: number) =>
    circles.push([x, y, radius * (1 + 0.2 * wobble(travelled / (radius * 1.5)))]);
  const first = pts[0] as Pt;
  push(first[0], first[1]);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Pt;
    const b = pts[i] as Pt;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let d = step; d <= len; d += step) {
      travelled += step;
      const t = d / len;
      push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
    }
  }
  return circles;
}

/** Contorno di una regione: smussato e leggermente irregolare, in modo deterministico. */
export function regionOutline(op: Pick<TerrainOp, "id" | "points">): number[] {
  const smooth = toPairs(chaikinClosed(op.points, 3));
  const wobble = noise1d(hashString(op.id));
  const n = smooth.length;
  return toFlat(
    smooth.map((p, i) => {
      const prev = smooth[(i - 1 + n) % n] as Pt;
      const next = smooth[(i + 1) % n] as Pt;
      const tx = next[0] - prev[0];
      const ty = next[1] - prev[1];
      const len = Math.hypot(tx, ty) || 1;
      const offset = 8 * wobble(i * 0.35);
      // Spostamento lungo la normale al contorno.
      return [p[0] + (-ty / len) * offset, p[1] + (tx / len) * offset] as Pt;
    }),
  );
}

/** Riquadro occupato da un'operazione, alone compreso. */
export function terrainOpBounds(op: TerrainOp): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < op.points.length; i += 2) {
    const x = op.points[i] as number;
    const y = op.points[i + 1] as number;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  // Raggio massimo con l'irregolarità del bordo, più la sfumatura (al massimo 24 px).
  const margin = op.shape === "brush" ? ((op.width ?? 40) / 2) * 1.25 + 26 : 8 + 24;
  return {
    x: minX - margin,
    y: minY - margin,
    width: maxX - minX + 2 * margin,
    height: maxY - minY + 2 * margin,
  };
}
