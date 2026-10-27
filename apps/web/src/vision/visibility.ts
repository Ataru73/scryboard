import { blocksSight, sideOfSegment, type Wall } from "@scryboard/shared";
import type { Point } from "../board/viewport";
import { type WallSegment, wallPieces } from "../walls/geometry";

/**
 * Segmenti che influenzano la vista, come array piatti [ax, ay, bx, by, ...] (trasferibili al
 * worker): quelli che fermano sempre, quelli a senso unico (la direzione a → b decide il lato
 * trasparente) e quelli di terreno (fermano solo il secondo lungo un raggio).
 */
export interface SightGeometry {
  blocking: Float64Array;
  oneWay: Float64Array;
  terrain: Float64Array;
}

/** Appiattisce i segmenti in [ax, ay, bx, by, ...]. */
function flatten(segments: WallSegment[]): Float64Array {
  const out: number[] = [];
  for (const { a, b } of segments) out.push(a.x, a.y, b.x, b.y);
  return Float64Array.from(out);
}

/** Una porta aperta posata su un muro vi apre un varco anche per la vista e la luce. */
export function sightGeometry(walls: Iterable<Wall>): SightGeometry {
  const all = [...walls];
  return {
    blocking: flatten(wallPieces(all, blocksSight)),
    oneWay: flatten(wallPieces(all, (w) => w.kind === "one-way")),
    terrain: flatten(wallPieces(all, (w) => w.kind === "terrain")),
  };
}

/** Segmenti che fermano sempre la vista e la luce (muri e porte non aperte). */
export function sightSegments(walls: Iterable<Wall>): Float64Array {
  return sightGeometry(walls).blocking;
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
export function visibilityPolygon(
  origin: Point,
  geometry: Float64Array | SightGeometry,
  radius = 0,
): number[] {
  const { blocking, oneWay, terrain } =
    geometry instanceof Float64Array
      ? { blocking: geometry, oneWay: new Float64Array(), terrain: new Float64Array() }
      : geometry;
  const bound = radius > 0 ? radius * 1.05 + 1 : FAR;
  const left = origin.x - bound;
  const right = origin.x + bound;
  const top = origin.y - bound;
  const bottom = origin.y + bound;

  const inBox = (ax: number, ay: number, bx: number, by: number) =>
    !(
      Math.max(ax, bx) < left ||
      Math.min(ax, bx) > right ||
      Math.max(ay, by) < top ||
      Math.min(ay, by) > bottom
    );

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
  for (let i = 0; i < blocking.length; i += 4) {
    const ax = blocking[i] as number;
    const ay = blocking[i + 1] as number;
    const bx = blocking[i + 2] as number;
    const by = blocking[i + 3] as number;
    if (inBox(ax, ay, bx, by)) segs.push(ax, ay, bx, by);
  }
  // A senso unico: dal lato sinistro (di chi percorre a → b) si vede attraverso, dall'altro no.
  for (let i = 0; i < oneWay.length; i += 4) {
    const ax = oneWay[i] as number;
    const ay = oneWay[i + 1] as number;
    const bx = oneWay[i + 2] as number;
    const by = oneWay[i + 3] as number;
    if (!inBox(ax, ay, bx, by)) continue;
    if (sideOfSegment({ x: ax, y: ay }, { x: bx, y: by }, origin) >= 0) segs.push(ax, ay, bx, by);
  }
  const terrainSegs: number[] = [];
  for (let i = 0; i < terrain.length; i += 4) {
    const ax = terrain[i] as number;
    const ay = terrain[i + 1] as number;
    const bx = terrain[i + 2] as number;
    const by = terrain[i + 3] as number;
    if (inBox(ax, ay, bx, by)) terrainSegs.push(ax, ay, bx, by);
  }

  const angles: number[] = [];
  const seen = new Set<string>();
  const addAngles = (list: number[]) => {
    for (let i = 0; i < list.length; i += 2) {
      const x = list[i] as number;
      const y = list[i + 1] as number;
      const key = `${Math.round(x * 100)},${Math.round(y * 100)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const a = Math.atan2(y - origin.y, x - origin.x);
      angles.push(a - ANGLE_EPSILON, a, a + ANGLE_EPSILON);
    }
  };
  addAngles(segs);
  addAngles(terrainSegs);
  angles.sort((a, b) => a - b);

  /** Distanza lungo il raggio (dx, dy) a cui incontra il segmento, o Infinity. */
  const hit = (list: number[], i: number, dx: number, dy: number): number => {
    const ax = list[i] as number;
    const ay = list[i + 1] as number;
    const sx = (list[i + 2] as number) - ax;
    const sy = (list[i + 3] as number) - ay;
    const denominator = dx * sy - dy * sx;
    if (Math.abs(denominator) < 1e-12) return Infinity;
    const qx = ax - origin.x;
    const qy = ay - origin.y;
    const t = (qx * sy - qy * sx) / denominator;
    const u = (qx * dy - qy * dx) / denominator;
    // t > 0 di poco: un'origine appoggiata a un muro non deve vedersi bloccata da esso.
    return t > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9 ? t : Infinity;
  };

  const polygon: number[] = [];
  for (const angle of angles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let nearest = Infinity;
    for (let i = 0; i < segs.length; i += 4) nearest = Math.min(nearest, hit(segs, i, dx, dy));
    // Terreno: la faccia davanti non ferma la vista, la seconda lungo il raggio sì.
    let first = Infinity;
    let second = Infinity;
    for (let i = 0; i < terrainSegs.length; i += 4) {
      const t = hit(terrainSegs, i, dx, dy);
      if (t < first) {
        second = first;
        first = t;
      } else if (t < second) {
        second = t;
      }
    }
    nearest = Math.min(nearest, second);
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
