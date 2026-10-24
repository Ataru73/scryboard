import type { Box, Point } from "../board/viewport";

export interface PathPoint {
  x: number;
  y: number;
  /** Larghezza del percorso in questo punto, in pixel del mondo. */
  w: number;
}

export function toPathPoints(flat: number[]): PathPoint[] {
  const out: PathPoint[] = [];
  for (let i = 0; i + 2 < flat.length; i += 3) {
    out.push({ x: flat[i] as number, y: flat[i + 1] as number, w: flat[i + 2] as number });
  }
  return out;
}

export function toFlat(points: PathPoint[]): number[] {
  return points.flatMap((p) => [p.x, p.y, p.w]);
}

/**
 * Curva di Catmull–Rom che passa per tutti i punti di controllo, campionata in modo da avere un
 * campione ogni ~8 px. La larghezza si interpola linearmente tra un punto e l'altro.
 */
export function catmullRom(points: PathPoint[]): PathPoint[] {
  if (points.length < 2) return points.slice();
  const out: PathPoint[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? (points[i] as PathPoint);
    const p1 = points[i] as PathPoint;
    const p2 = points[i + 1] as PathPoint;
    const p3 = points[i + 2] ?? p2;
    const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const steps = Math.max(2, Math.min(60, Math.ceil(length / 8)));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const spline = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({
        x: spline(p0.x, p1.x, p2.x, p3.x),
        y: spline(p0.y, p1.y, p2.y, p3.y),
        w: p1.w + (p2.w - p1.w) * t,
      });
    }
  }
  out.push({ ...(points[points.length - 1] as PathPoint) });
  return out;
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * Assottiglia le estremità (fiumi e ruscelli): entro `length` dall'inizio e dalla fine la
 * larghezza scende dolcemente fino al 15%.
 */
export function applyTaper(samples: PathPoint[], length: number): PathPoint[] {
  const distances = [0];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1] as PathPoint;
    const b = samples[i] as PathPoint;
    distances.push((distances[i - 1] as number) + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = distances[distances.length - 1] as number;
  const taper = Math.min(length, total / 2);
  if (taper <= 0) return samples;
  return samples.map((p, i) => {
    const d = distances[i] as number;
    const f = Math.min(1, d / taper, (total - d) / taper);
    return { ...p, w: p.w * (0.15 + 0.85 * smoothstep(f)) };
  });
}

/** Toglie i campioni coincidenti, che non hanno una direzione. */
function dedupe(samples: PathPoint[]): PathPoint[] {
  return samples.filter((p, i) => {
    const prev = samples[i - 1];
    return !prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 0.01;
  });
}

/**
 * Contorno chiuso del percorso: bordo sinistro, estremità, bordo destro all'indietro. Le normali
 * sono la media delle direzioni dei segmenti vicini; con `roundCaps` le estremità sono
 * semicerchi (strade), altrimenti tagli netti (i fiumi assottigliati finiscono a punta).
 */
export function pathOutline(input: PathPoint[], roundCaps: boolean, widthScale = 1): number[] {
  const samples = dedupe(input);
  if (samples.length < 2) return [];
  const normals = samples.map((_, i) => {
    const a = samples[Math.max(0, i - 1)] as PathPoint;
    const b = samples[Math.min(samples.length - 1, i + 1)] as PathPoint;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: -dy / len, y: dx / len };
  });
  const left: number[] = [];
  const right: number[] = [];
  samples.forEach((p, i) => {
    const n = normals[i] as Point;
    const half = (p.w * widthScale) / 2;
    left.push(p.x + n.x * half, p.y + n.y * half);
    right.push(p.x - n.x * half, p.y - n.y * half);
  });
  // Semicerchio attorno a un'estremità, da `start` (angolo rispetto alla normale) in senso
  // orario: alla fine va dal bordo sinistro al destro passando davanti, all'inizio dal destro al
  // sinistro passando dietro.
  const cap = (p: PathPoint, n: Point, start: number) => {
    const out: number[] = [];
    if (!roundCaps) return out;
    const half = (p.w * widthScale) / 2;
    const base = Math.atan2(n.y, n.x) + start;
    for (let k = 1; k < 8; k++) {
      const a = base - (Math.PI * k) / 8;
      out.push(p.x + Math.cos(a) * half, p.y + Math.sin(a) * half);
    }
    return out;
  };
  const last = samples[samples.length - 1] as PathPoint;
  const first = samples[0] as PathPoint;
  const reversedRight: number[] = [];
  for (let i = right.length - 2; i >= 0; i -= 2)
    reversedRight.push(right[i] as number, right[i + 1] as number);
  return [
    ...left,
    ...cap(last, normals[normals.length - 1] as Point, 0),
    ...reversedRight,
    ...cap(first, normals[0] as Point, Math.PI),
  ];
}

/** Riquadro dei punti di controllo, allargato della metà della larghezza massima. */
export function pathBounds(flat: number[]): Box {
  const points = toPathPoints(flat);
  const half = Math.max(...points.map((p) => p.w)) / 2;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs) - half;
  const y = Math.min(...ys) - half;
  return { x, y, width: Math.max(...xs) + half - x, height: Math.max(...ys) + half - y };
}

/** Segmento della spezzata di controllo più vicino al punto, per inserirvi un nuovo vertice. */
export function nearestSegment(
  points: PathPoint[],
  p: Point,
): { index: number; t: number; distance: number } {
  let best = { index: 0, t: 0, distance: Infinity };
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i] as PathPoint;
    const b = points[i + 1] as PathPoint;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t =
      len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const distance = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    if (distance < best.distance) best = { index: i, t, distance };
  }
  return best;
}

/** Inserisce un punto di controllo sul segmento `index`, con larghezza interpolata. */
export function insertPoint(points: PathPoint[], index: number, t: number): PathPoint[] {
  const a = points[index] as PathPoint;
  const b = points[index + 1] as PathPoint;
  const inserted = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t };
  return [...points.slice(0, index + 1), inserted, ...points.slice(index + 1)];
}
