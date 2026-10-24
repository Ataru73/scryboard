import type { GridSettings } from "@scryboard/shared";
import type { Box, Point } from "./viewport";

/**
 * Griglie esagonali in coordinate assiali (q, r) rispetto al centro dell'esagono di riferimento
 * (offsetX, offsetY). `size` è la distanza tra due lati opposti, quindi il raggio (centro →
 * vertice) è size / √3. Formule da Red Blob Games, "Hexagonal Grids".
 */
export interface Axial {
  q: number;
  r: number;
}

const SQRT3 = Math.sqrt(3);

export const isHex = (grid: GridSettings) => grid.type !== "square";
const pointy = (grid: GridSettings) => grid.type === "hex-pointy";
export const hexRadius = (grid: GridSettings) => grid.size / SQRT3;

export function hexToPixel(h: Axial, grid: GridSettings): Point {
  const R = hexRadius(grid);
  if (pointy(grid)) {
    return { x: grid.offsetX + grid.size * (h.q + h.r / 2), y: grid.offsetY + 1.5 * R * h.r };
  }
  return { x: grid.offsetX + 1.5 * R * h.q, y: grid.offsetY + grid.size * (h.r + h.q / 2) };
}

/** Esagono che contiene il punto (arrotondamento in coordinate cubiche). */
export function pixelToHex(p: Point, grid: GridSettings): Axial {
  const R = hexRadius(grid);
  const x = p.x - grid.offsetX;
  const y = p.y - grid.offsetY;
  const q = pointy(grid) ? ((SQRT3 / 3) * x - y / 3) / R : ((2 / 3) * x) / R;
  const r = pointy(grid) ? ((2 / 3) * y) / R : (-x / 3 + (SQRT3 / 3) * y) / R;
  // Arrotondamento cubico: si corregge la coordinata con l'errore più grande.
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq + 0, r: rr + 0 };
}

/** Vertici dell'esagono (6 punti), in senso orario a partire da destra. */
export function hexCorners(h: Axial, grid: GridSettings): Point[] {
  const c = hexToPixel(h, grid);
  const R = hexRadius(grid);
  const start = pointy(grid) ? -30 : 0;
  return Array.from({ length: 6 }, (_, i) => {
    const a = ((start + 60 * i) * Math.PI) / 180;
    return { x: c.x + R * Math.cos(a), y: c.y + R * Math.sin(a) };
  });
}

/** Colonna e riga "a scacchiera" (righe dispari spostate), più leggibili delle assiali. */
export function hexOffsetCoords(h: Axial, grid: GridSettings): { col: number; row: number } {
  if (pointy(grid)) return { col: h.q + (h.r - (h.r & 1)) / 2, row: h.r };
  return { col: h.q, row: h.r + (h.q - (h.q & 1)) / 2 };
}

/** Vertice di esagono più vicino al punto: i muri seguono i lati degli esagoni. */
export function nearestHexCorner(p: Point, grid: GridSettings): Point {
  const center = pixelToHex(p, grid);
  let best = hexToPixel(center, grid);
  let bestDistance = Infinity;
  for (const corner of hexCorners(center, grid)) {
    const d = Math.hypot(corner.x - p.x, corner.y - p.y);
    if (d < bestDistance) {
      bestDistance = d;
      best = corner;
    }
  }
  return best;
}

/** Centri degli esagoni che toccano il riquadro visibile. */
export function visibleHexes(grid: GridSettings, visible: Box): Axial[] {
  const corners = [
    { x: visible.x, y: visible.y },
    { x: visible.x + visible.width, y: visible.y },
    { x: visible.x, y: visible.y + visible.height },
    { x: visible.x + visible.width, y: visible.y + visible.height },
  ].map((p) => pixelToHex(p, grid));
  const minQ = Math.min(...corners.map((h) => h.q)) - 2;
  const maxQ = Math.max(...corners.map((h) => h.q)) + 2;
  const minR = Math.min(...corners.map((h) => h.r)) - 2;
  const maxR = Math.max(...corners.map((h) => h.r)) + 2;
  const margin = grid.size;
  const out: Axial[] = [];
  for (let r = minR; r <= maxR; r++) {
    for (let q = minQ; q <= maxQ; q++) {
      const c = hexToPixel({ q, r }, grid);
      if (
        c.x >= visible.x - margin &&
        c.x <= visible.x + visible.width + margin &&
        c.y >= visible.y - margin &&
        c.y <= visible.y + visible.height + margin
      ) {
        out.push({ q, r });
      }
    }
  }
  return out;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * Offset ridotto al periodo della griglia esagonale: spostando di una colonna (in orizzontale per
 * quella a punta) o di due righe la griglia resta identica.
 */
export function normalizeHexOffset(grid: GridSettings): { offsetX: number; offsetY: number } {
  const R = hexRadius(grid);
  const round = (v: number) => Math.round(v * 100) / 100;
  if (pointy(grid))
    return {
      offsetX: round(mod(grid.offsetX, grid.size)),
      offsetY: round(mod(grid.offsetY, 3 * R)),
    };
  return { offsetX: round(mod(grid.offsetX, 3 * R)), offsetY: round(mod(grid.offsetY, grid.size)) };
}
