import { blocksMovement, type Wall } from "@scryboard/shared";
import type { Point } from "../board/viewport";

export interface WallSegment {
  a: Point;
  b: Point;
  wall: Wall;
}

export interface SegmentIntersection {
  /** Posizione sull'intero primo segmento (0 = a, 1 = b). */
  t: number;
  /** Posizione sull'intero secondo segmento (0 = c, 1 = d). */
  u: number;
  x: number;
  y: number;
}

const PARAMETER_EPSILON = 1e-9;
const DISTANCE_EPSILON = 1e-9;
const MOVEMENT_CLEARANCE = 0.5;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const subtract = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const finitePoint = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);

/** Espande le polilinee dei soli muri che bloccano il movimento. */
export function wallSegments(walls: Iterable<Wall>): WallSegment[] {
  const segments: WallSegment[] = [];
  for (const wall of walls) {
    if (!blocksMovement(wall)) continue;
    for (let i = 0; i + 3 < wall.points.length; i += 2) {
      segments.push({
        a: { x: wall.points[i] as number, y: wall.points[i + 1] as number },
        b: { x: wall.points[i + 2] as number, y: wall.points[i + 3] as number },
        wall,
      });
    }
  }
  return segments;
}

function pointIntersection(p: Point, c: Point, s: Point, ss: number) {
  const u = dot(subtract(p, c), s) / ss;
  if (u < -PARAMETER_EPSILON || u > 1 + PARAMETER_EPSILON) return null;
  const clampedU = clamp01(u);
  const closest = { x: c.x + clampedU * s.x, y: c.y + clampedU * s.y };
  if (Math.hypot(p.x - closest.x, p.y - closest.y) > DISTANCE_EPSILON) return null;
  return { t: 0, u: clampedU, x: p.x, y: p.y };
}

/**
 * Intersezione fra due segmenti chiusi. Per sovrapposizioni collineari restituisce il primo punto
 * dell'overlap lungo `a → b`; segmenti degeneri sono trattati come punti.
 */
export function segmentIntersection(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): SegmentIntersection | null {
  if (![a, b, c, d].every(finitePoint)) return null;

  const r = subtract(b, a);
  const s = subtract(d, c);
  const rr = dot(r, r);
  const ss = dot(s, s);

  if (rr === 0 && ss === 0) {
    return Math.hypot(a.x - c.x, a.y - c.y) <= DISTANCE_EPSILON
      ? { t: 0, u: 0, x: a.x, y: a.y }
      : null;
  }
  if (rr === 0) return pointIntersection(a, c, s, ss);
  if (ss === 0) {
    const hit = pointIntersection(c, a, r, rr);
    return hit ? { t: hit.u, u: 0, x: hit.x, y: hit.y } : null;
  }

  const ac = subtract(c, a);
  const denominator = cross(r, s);
  const parallelTolerance = Number.EPSILON * 32 * Math.sqrt(rr * ss);

  if (Math.abs(denominator) <= parallelTolerance) {
    // La distanza dalla retta, anziché il solo prodotto vettoriale, dà una tolleranza in pixel.
    if (Math.abs(cross(ac, r)) / Math.sqrt(rr) > DISTANCE_EPSILON) return null;

    const tc = dot(ac, r) / rr;
    const td = dot(subtract(d, a), r) / rr;
    const low = Math.max(0, Math.min(tc, td));
    const high = Math.min(1, Math.max(tc, td));
    if (low > high + PARAMETER_EPSILON) return null;

    const t = clamp01(low);
    const x = a.x + t * r.x;
    const y = a.y + t * r.y;
    const u = clamp01(dot(subtract({ x, y }, c), s) / ss);
    return { t, u, x, y };
  }

  const t = cross(ac, s) / denominator;
  const u = cross(ac, r) / denominator;
  if (
    t < -PARAMETER_EPSILON ||
    t > 1 + PARAMETER_EPSILON ||
    u < -PARAMETER_EPSILON ||
    u > 1 + PARAMETER_EPSILON
  ) {
    return null;
  }

  const clampedT = clamp01(t);
  return {
    t: clampedT,
    u: clamp01(u),
    x: a.x + clampedT * r.x,
    y: a.y + clampedT * r.y,
  };
}

/**
 * Frazione percorribile di `start → end`, arretrando di circa mezzo pixel dal primo impatto.
 * Un impatto a `t = 0` non blocca: consente a un centro appoggiato al muro di staccarsi.
 */
export function movementFraction(
  start: Point,
  end: Point,
  segments: Iterable<WallSegment>,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length === 0) return 1;

  let first = Infinity;
  for (const segment of segments) {
    const hit = segmentIntersection(start, end, segment.a, segment.b);
    if (hit && hit.t > PARAMETER_EPSILON && hit.t < first) first = hit.t;
  }
  if (!Number.isFinite(first)) return 1;
  return Math.max(0, Math.min(1, first - MOVEMENT_CLEARANCE / length));
}

/** Limita il movimento del centro del token senza modificare i punti forniti. */
export function constrainMovement(
  start: Point,
  end: Point,
  segments: Iterable<WallSegment>,
): Point {
  const fraction = movementFraction(start, end, segments);
  if (fraction === 1) return { x: end.x, y: end.y };
  return {
    x: start.x + (end.x - start.x) * fraction,
    y: start.y + (end.y - start.y) * fraction,
  };
}

/** Chiave di una polilinea, arrotondata al centesimo di pixel per assorbire gli errori di calcolo. */
function pointsKey(points: number[]): string {
  return points.map((v) => Math.round(v * 100)).join(",");
}

/**
 * Contorni non ancora presenti tra i muri: rigenerare dai bordi dello stesso terreno produce gli
 * stessi contorni, che non vanno duplicati.
 */
export function newContours(contours: number[][], existing: Iterable<Wall>): number[][] {
  const keys = new Set<string>();
  for (const wall of existing) keys.add(pointsKey(wall.points));
  return contours.filter((points) => {
    const key = pointsKey(points);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}
