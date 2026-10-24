import type { GridSettings } from "@scryboard/shared";
import {
  hexOffsetCoords,
  hexToPixel,
  isHex,
  nearestHexCorner,
  normalizeHexOffset,
  pixelToHex,
} from "./hex";
import type { Box, Point } from "./viewport";

const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * Centro agganciato alla griglia per un token di `tokenSize` caselle: le taglie dispari (e le
 * frazioni) vanno al centro di una casella, quelle pari su un incrocio delle linee.
 */
export function snapTokenCenter(p: Point, tokenSize: number, grid: GridSettings): Point {
  // Sugli esagoni ogni token va al centro di un esagono.
  if (isHex(grid)) return hexToPixel(pixelToHex(p, grid), grid);
  const shift = Number.isInteger(tokenSize) && tokenSize % 2 === 0 ? 0 : grid.size / 2;
  const snap = (v: number, offset: number) =>
    Math.round((v - offset - shift) / grid.size) * grid.size + offset + shift;
  return { x: snap(p.x, grid.offsetX), y: snap(p.y, grid.offsetY) };
}

/**
 * Aggancia un punto agli incroci della griglia (o ai vertici degli esagoni), inclusi offset e
 * coordinate negative.
 */
export function snapGridCorner(p: Point, grid: GridSettings): Point {
  if (isHex(grid)) return nearestHexCorner(p, grid);
  const snap = (value: number, offset: number) =>
    Math.round((value - offset) / grid.size) * grid.size + offset;
  return { x: snap(p.x, grid.offsetX), y: snap(p.y, grid.offsetY) };
}

/** Casella che contiene il punto (colonna e riga possono essere negative). */
export function cellAt(p: Point, grid: GridSettings): { col: number; row: number } {
  if (isHex(grid)) return hexOffsetCoords(pixelToHex(p, grid), grid);
  return {
    col: Math.floor((p.x - grid.offsetX) / grid.size),
    row: Math.floor((p.y - grid.offsetY) / grid.size),
  };
}

/**
 * Griglia che ha come casella il riquadro tracciato dal GM sulla mappa. Per gli esagoni il
 * riquadro racchiude un esagono: il lato fra due lati opposti dà la misura, il centro la
 * posizione.
 */
export function calibrateFromBox(
  box: Box,
  type: GridSettings["type"] = "square",
): Pick<GridSettings, "size" | "offsetX" | "offsetY"> | null {
  // Un riquadro tracciato a mano non è preciso al pixel: si arrotonda al mezzo pixel, lo stesso
  // passo dei campi del pannello.
  const half = (v: number) => Math.round(v * 2) / 2;
  if (type !== "square") {
    // A punta: larghezza = misura, altezza = 2 raggi = misura · 2/√3 (piatta: il contrario).
    const across = type === "hex-pointy" ? box.width : box.height;
    const along = type === "hex-pointy" ? box.height : box.width;
    const size = half((across + (along * Math.sqrt(3)) / 2) / 2);
    if (size < 8) return null;
    const grid = {
      enabled: true,
      type,
      size,
      offsetX: box.x + box.width / 2,
      offsetY: box.y + box.height / 2,
    };
    return { size, ...normalizeHexOffset(grid) };
  }
  const size = half((box.width + box.height) / 2);
  if (size < 8) return null;
  return { size, offsetX: half(mod(box.x, size)) % size, offsetY: half(mod(box.y, size)) % size };
}

/** Normalizza l'offset in [0, size) dopo una modifica manuale. */
export function normalizeOffset(offset: number, size: number): number {
  return Math.round(mod(offset, size) * 100) / 100;
}

/** Offset ridotti al periodo della griglia, quadrata o esagonale: la griglia non si sposta. */
export function normalizeGridOffsets(grid: GridSettings): { offsetX: number; offsetY: number } {
  if (isHex(grid)) return normalizeHexOffset(grid);
  return {
    offsetX: normalizeOffset(grid.offsetX, grid.size),
    offsetY: normalizeOffset(grid.offsetY, grid.size),
  };
}

/** Coordinate delle linee visibili nel riquadro, oppure null se le caselle sono troppo fitte. */
export function visibleGridLines(
  grid: GridSettings,
  visible: Box,
  scale: number,
): { xs: number[]; ys: number[] } | null {
  if (grid.size * scale < 6) return null;
  const lines = (start: number, length: number, offset: number) => {
    const first = Math.ceil((start - offset) / grid.size) * grid.size + offset;
    const out: number[] = [];
    for (let v = first; v <= start + length; v += grid.size) out.push(v);
    return out;
  };
  return {
    xs: lines(visible.x, visible.width, grid.offsetX),
    ys: lines(visible.y, visible.height, grid.offsetY),
  };
}

/** Iniziali per i token senza immagine: "Goblin arciere" → "GA", "Thorin" → "TH". */
export function tokenInitials(name: string): string {
  const [first = "", second = ""] = name.trim().split(/\s+/).filter(Boolean);
  if (!first) return "?";
  return (second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2)).toUpperCase();
}

/**
 * Nome per un nuovo token: se il nome è già usato aggiunge il primo numero libero
 * ("Goblin" → "Goblin 2", "Goblin 3"...).
 */
export function nextTokenName(base: string, existing: Iterable<string>): string {
  const name = base.trim();
  if (!name) return "";
  const taken = new Set(existing);
  if (!taken.has(name)) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
