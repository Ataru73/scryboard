export interface ContourOptions {
  /** Valore rigorosamente superato dai campioni interni. Per alfa a 8 bit, 0,5 equivale a 127,5. */
  threshold?: number;
  /** Tolleranza RDP in pixel del raster; zero rimuove soltanto i punti collineari. */
  tolerance?: number;
}

type Pt = [number, number];

// Lati della cella: 0 = alto, 1 = destra, 2 = basso, 3 = sinistra.
const CONNECTIONS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [],
  [[0, 3]],
  [[0, 1]],
  [[3, 1]],
  [[1, 2]],
  [], // Saddle: risolto con il valore medio della cella.
  [[0, 2]],
  [[3, 2]],
  [[2, 3]],
  [[0, 2]],
  [], // Saddle.
  [[1, 2]],
  [[3, 1]],
  [[0, 1]],
  [[0, 3]],
  [],
];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function validateMask(mask: Uint8Array, width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 0 || height < 0) {
    throw new RangeError("Raster dimensions must be non-negative integers");
  }
  if (mask.length !== width * height) {
    throw new RangeError("The mask length must equal width × height");
  }
}

function contourArea(points: number[]): number {
  let twiceArea = 0;
  for (let i = 0; i + 3 < points.length; i += 2) {
    twiceArea +=
      (points[i] as number) * (points[i + 3] as number) -
      (points[i + 2] as number) * (points[i + 1] as number);
  }
  return twiceArea / 2;
}

function validClosedContour(points: number[]): boolean {
  if (points.length < 8 || points.length % 2 !== 0) return false;
  const last = points.length - 2;
  if (points[0] !== points[last] || points[1] !== points[last + 1]) return false;
  if (!points.every(Number.isFinite)) return false;
  const area = contourArea(points);
  return Number.isFinite(area) && area !== 0;
}

/**
 * Marching squares su campioni disposti alle coordinate intere del raster. Fuori dal raster si
 * assume una maschera vuota, così anche le regioni che toccano il bordo producono loop chiusi.
 * Per una maschera di alfa a 8 bit, usare `threshold = 127.5` per una soglia normalizzata di 0,5.
 */
export function marchingSquares(
  mask: Uint8Array,
  width: number,
  height: number,
  threshold = 0.5,
): number[][] {
  validateMask(mask, width, height);
  if (!Number.isFinite(threshold)) throw new RangeError("The threshold must be finite");
  if (width === 0 || height === 0 || threshold >= 255) return [];

  const valueAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : (mask[y * width + x] as number);
  const horizontalCount = (width + 1) * (height + 2);
  const horizontalKey = (x: number, y: number) => (y + 1) * (width + 1) + x + 1;
  const verticalKey = (x: number, y: number) => horizontalCount + (y + 1) * (width + 2) + x + 1;

  // Una chiave identifica globalmente un lato: celle adiacenti riusano esattamente lo stesso punto.
  const crossings = new Map<number, Pt>();
  const crossing = (
    side: number,
    x: number,
    y: number,
    nw: number,
    ne: number,
    se: number,
    sw: number,
  ): number => {
    let key: number;
    let ax: number;
    let ay: number;
    let bx: number;
    let by: number;
    let av: number;
    let bv: number;
    switch (side) {
      case 0:
        key = horizontalKey(x, y);
        ax = x;
        ay = y;
        bx = x + 1;
        by = y;
        av = nw;
        bv = ne;
        break;
      case 1:
        key = verticalKey(x + 1, y);
        ax = x + 1;
        ay = y;
        bx = x + 1;
        by = y + 1;
        av = ne;
        bv = se;
        break;
      case 2:
        // Il lato basso ha sempre orientamento sinistra → destra, anche se i bit sono NW…SW.
        key = horizontalKey(x, y + 1);
        ax = x;
        ay = y + 1;
        bx = x + 1;
        by = y + 1;
        av = sw;
        bv = se;
        break;
      default:
        key = verticalKey(x, y);
        ax = x;
        ay = y;
        bx = x;
        by = y + 1;
        av = nw;
        bv = sw;
        break;
    }
    if (!crossings.has(key)) {
      const fraction = clamp01((threshold - av) / (bv - av));
      crossings.set(key, [ax + (bx - ax) * fraction, ay + (by - ay) * fraction]);
    }
    return key;
  };

  const segmentA: number[] = [];
  const segmentB: number[] = [];
  for (let y = -1; y < height; y++) {
    for (let x = -1; x < width; x++) {
      const nw = valueAt(x, y);
      const ne = valueAt(x + 1, y);
      const se = valueAt(x + 1, y + 1);
      const sw = valueAt(x, y + 1);
      const bits =
        (nw > threshold ? 1 : 0) |
        (ne > threshold ? 2 : 0) |
        (se > threshold ? 4 : 0) |
        (sw > threshold ? 8 : 0);
      if (bits === 0 || bits === 15) continue;

      let connections = CONNECTIONS[bits] as ReadonlyArray<readonly [number, number]>;
      if (bits === 5 || bits === 10) {
        // In caso di parità separiamo le diagonali: evita auto-intersezioni e vertici ripetuti.
        const centerInside = (nw + ne + se + sw) / 4 > threshold;
        if (bits === 5) {
          connections = centerInside
            ? [
                [0, 1],
                [2, 3],
              ]
            : [
                [0, 3],
                [1, 2],
              ];
        } else {
          connections = centerInside
            ? [
                [0, 3],
                [1, 2],
              ]
            : [
                [0, 1],
                [2, 3],
              ];
        }
      }

      for (const [from, to] of connections) {
        const a = crossing(from, x, y, nw, ne, se, sw);
        const b = crossing(to, x, y, nw, ne, se, sw);
        if (a !== b) {
          segmentA.push(a);
          segmentB.push(b);
        }
      }
    }
  }

  const adjacency = new Map<number, number[]>();
  const connect = (key: number, segment: number) => {
    const linked = adjacency.get(key);
    if (linked) linked.push(segment);
    else adjacency.set(key, [segment]);
  };
  for (let i = 0; i < segmentA.length; i++) {
    connect(segmentA[i] as number, i);
    connect(segmentB[i] as number, i);
  }

  // Il grafo ha grado al massimo due. Consumare gli spigoli concatena anche i saddle senza mai
  // affidarsi all'ordine lessicografico di coordinate floating point.
  const used = new Uint8Array(segmentA.length);
  const contours: number[][] = [];
  for (let seed = 0; seed < segmentA.length; seed++) {
    if (used[seed]) continue;
    used[seed] = 1;
    const first = segmentA[seed] as number;
    let current = segmentB[seed] as number;
    const keys = [first, current];

    while (current !== first && keys.length <= segmentA.length + 1) {
      const next = (adjacency.get(current) ?? []).find((index) => !used[index]);
      if (next === undefined) break;
      used[next] = 1;
      current =
        segmentA[next] === current ? (segmentB[next] as number) : (segmentA[next] as number);
      keys.push(current);
    }
    if (current !== first) keys.push(first);

    const contour: number[] = [];
    for (const key of keys) {
      const point = crossings.get(key) as Pt;
      const last = contour.length - 2;
      if (last >= 0 && contour[last] === point[0] && contour[last + 1] === point[1]) continue;
      contour.push(point[0], point[1]);
    }
    const last = contour.length - 2;
    if (last >= 0 && (contour[0] !== contour[last] || contour[1] !== contour[last + 1])) {
      contour.push(contour[0] as number, contour[1] as number);
    }
    if (validClosedContour(contour)) contours.push(contour);
  }
  return contours;
}

function toPairs(points: number[]): Pt[] {
  const pairs: Pt[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    pairs.push([points[i] as number, points[i + 1] as number]);
  }
  return pairs;
}

function distanceToSegmentSquared(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0 ? 0 : clamp01(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared);
  return (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
}

function markRdp(points: Pt[], start: number, end: number, keep: Uint8Array, tolerance: number) {
  const toleranceSquared = tolerance * tolerance;
  const stack: [number, number][] = [[start, end]];
  while (stack.length > 0) {
    const [from, to] = stack.pop() as [number, number];
    let farthest = -1;
    let maximum = toleranceSquared;
    for (let i = from + 1; i < to; i++) {
      const distance = distanceToSegmentSquared(
        points[i] as Pt,
        points[from] as Pt,
        points[to] as Pt,
      );
      if (distance > maximum) {
        maximum = distance;
        farthest = i;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      stack.push([from, farthest], [farthest, to]);
    }
  }
}

/** RDP per loop: due ancore distanti evitano la baseline degenere primo punto = ultimo punto. */
export function simplifyClosedContour(points: number[], tolerance = 0): number[] {
  if (points.length % 2 !== 0) throw new RangeError("Contour coordinates must be pairs");
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new RangeError("The tolerance must be a non-negative finite number");
  }

  const unique: Pt[] = [];
  for (const point of toPairs(points)) {
    const previous = unique.at(-1);
    if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) unique.push(point);
  }
  if (
    unique.length > 1 &&
    unique[0]?.[0] === unique.at(-1)?.[0] &&
    unique[0]?.[1] === unique.at(-1)?.[1]
  ) {
    unique.pop();
  }
  const count = unique.length;
  if (count < 3) return [];

  const farthestFrom = (from: number) => {
    let index = from;
    let maximum = -1;
    const origin = unique[from] as Pt;
    for (let i = 0; i < count; i++) {
      const point = unique[i] as Pt;
      const distance = (point[0] - origin[0]) ** 2 + (point[1] - origin[1]) ** 2;
      if (distance > maximum) {
        maximum = distance;
        index = i;
      }
    }
    return index;
  };
  const anchor = farthestFrom(0);
  const opposite = farthestFrom(anchor);
  if (anchor === opposite) return [];

  const loop = [...unique.slice(anchor), ...unique.slice(0, anchor)];
  loop.push(loop[0] as Pt);
  const split = (opposite - anchor + count) % count;
  const keep = new Uint8Array(count + 1);
  keep[0] = 1;
  keep[split] = 1;
  keep[count] = 1;
  markRdp(loop, 0, split, keep, tolerance);
  markRdp(loop, split, count, keep, tolerance);

  let kept = 0;
  for (let i = 0; i < count; i++) kept += keep[i] as number;
  if (kept < 3) {
    // Anche una tolleranza enorme non deve trasformare un poligono in un segmento andata/ritorno.
    let best = -1;
    let maximum = 0;
    for (let i = 1; i < count; i++) {
      if (keep[i]) continue;
      const distance = distanceToSegmentSquared(loop[i] as Pt, loop[0] as Pt, loop[split] as Pt);
      if (distance > maximum) {
        maximum = distance;
        best = i;
      }
    }
    if (best === -1) return [];
    keep[best] = 1;
  }

  const simplified = loop.filter((_, index) => keep[index]);
  return simplified.flat();
}

function orientation(a: Pt, b: Pt, c: Pt): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(point: Pt, a: Pt, b: Pt): boolean {
  return (
    Math.min(a[0], b[0]) <= point[0] &&
    point[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= point[1] &&
    point[1] <= Math.max(a[1], b[1])
  );
}

/** Include incroci propri, contatti agli estremi e sovrapposizioni collineari. */
function segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  if (
    Math.max(a[0], b[0]) < Math.min(c[0], d[0]) ||
    Math.max(c[0], d[0]) < Math.min(a[0], b[0]) ||
    Math.max(a[1], b[1]) < Math.min(c[1], d[1]) ||
    Math.max(c[1], d[1]) < Math.min(a[1], b[1])
  ) {
    return false;
  }
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return true;
  return (
    (abC === 0 && onSegment(c, a, b)) ||
    (abD === 0 && onSegment(d, a, b)) ||
    (cdA === 0 && onSegment(a, c, d)) ||
    (cdB === 0 && onSegment(b, c, d))
  );
}

function isSimpleClosedContour(contour: number[]): boolean {
  if (!validClosedContour(contour)) return false;
  const vertices = toPairs(contour).slice(0, -1);
  const count = vertices.length;
  for (let i = 0; i < count; i++) {
    const a = vertices[i] as Pt;
    const b = vertices[(i + 1) % count] as Pt;
    if (a[0] === b[0] && a[1] === b[1]) return false;
  }
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      if (j === i + 1 || (i === 0 && j === count - 1)) continue;
      if (
        segmentsIntersect(
          vertices[i] as Pt,
          vertices[(i + 1) % count] as Pt,
          vertices[j] as Pt,
          vertices[(j + 1) % count] as Pt,
        )
      ) {
        return false;
      }
    }
  }
  return true;
}

/** Estrae loop chiusi e applica RDP, senza conservare semplificazioni auto-intersecanti. */
export function maskContours(
  mask: Uint8Array,
  width: number,
  height: number,
  options: ContourOptions = {},
): number[][] {
  const tolerance = options.tolerance ?? 0;
  const result: number[][] = [];
  for (const raw of marchingSquares(mask, width, height, options.threshold ?? 0.5)) {
    const simplified = simplifyClosedContour(raw, tolerance);
    // Zero toglie solo punti collineari; anche una RDP che non rimuove nulla non cambia il loop.
    const unchangedGeometry = tolerance === 0 || simplified.length === raw.length;
    if (unchangedGeometry ? validClosedContour(simplified) : isSimpleClosedContour(simplified)) {
      result.push(simplified);
      continue;
    }

    const collinear = simplifyClosedContour(raw, 0);
    if (collinear.length === raw.length || isSimpleClosedContour(collinear)) result.push(collinear);
    else result.push(raw);
  }
  return result;
}
