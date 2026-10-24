import { BIOMES, type BiomeId, type TerrainOp, type Wall } from "@scryboard/shared";
import type { Box, Point } from "../board/viewport";
import { maskContours } from "../walls/contours";
import { drawTerrainOpFlat } from "./render";

/** Etichetta dei pixel che sono muri: il riempimento non li attraversa. */
const WALL_LABEL = 255;
const MAX_SIDE = 2048;
const MAX_COORDINATES = 20_000;
const NOT_CLOSED = "L'area non è chiusa: delimitala con muri o altri biomi.";

/**
 * Riempimento a macchia d'olio (4 vicini) dei pixel con la stessa etichetta del punto di
 * partenza. Dice anche se si è arrivati al bordo del raster, cioè se l'area non è chiusa.
 */
export function floodFill(
  labels: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
): { mask: Uint8Array; touchesBorder: boolean; count: number } {
  const mask = new Uint8Array(width * height);
  const target = labels[startY * width + startX];
  let touchesBorder = false;
  let count = 0;
  const stack = [startY * width + startX];
  mask[startY * width + startX] = 1;
  while (stack.length > 0) {
    const index = stack.pop() as number;
    count++;
    const x = index % width;
    const y = (index - x) / width;
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;
    const neighbours = [
      x > 0 ? index - 1 : -1,
      x < width - 1 ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y < height - 1 ? index + width : -1,
    ];
    for (const n of neighbours) {
      if (n >= 0 && !mask[n] && labels[n] === target) {
        mask[n] = 1;
        stack.push(n);
      }
    }
  }
  return { mask, touchesBorder, count };
}

/** Allarga la maschera di un pixel: il riempimento si sovrappone appena ai bordi, senza fessure. */
export function dilate(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      out[i] =
        mask[i] ||
        (x > 0 && mask[i - 1]) ||
        (x < width - 1 && mask[i + 1]) ||
        (y > 0 && mask[i - width]) ||
        (y < height - 1 && mask[i + width])
          ? 255
          : 0;
    }
  }
  return out;
}

export type FillResult =
  | { ok: true; points: number[]; rings: number[] }
  | { ok: false; reason: string };

/**
 * Anelli dell'area chiusa che contiene `at`: zona contigua dello stesso bioma (o vuota), delimitata
 * da altri biomi e dai muri. `area` è la zona da esaminare (la mappa con un margine): se il
 * riempimento ne raggiunge il bordo, l'area non è chiusa.
 */
export function terrainFillArea(
  ops: TerrainOp[],
  walls: Wall[],
  at: Point,
  area: Box,
  cellSize: number,
  biome: BiomeId,
): FillResult {
  let spacing = cellSize / 6;
  spacing = Math.max(spacing, area.width / MAX_SIDE, area.height / MAX_SIDE);
  const width = Math.ceil(area.width / spacing);
  const height = Math.ceil(area.height / spacing);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.setTransform(1 / spacing, 0, 0, 1 / spacing, -area.x / spacing, -area.y / spacing);
  // Ogni bioma ha il suo rosso: rgb(indice + 1, 0, 0).
  for (const op of ops) {
    const index = BIOMES.findIndex((b) => b.id === op.biome);
    drawTerrainOpFlat(ctx, op, `rgb(${index + 1}, 0, 0)`);
  }
  ctx.strokeStyle = `rgb(${WALL_LABEL}, 0, 0)`;
  ctx.lineWidth = Math.max(spacing * 1.5, 2);
  ctx.lineCap = "round";
  for (const wall of walls) {
    ctx.beginPath();
    for (let i = 0; i + 1 < wall.points.length; i += 2) {
      if (i === 0) ctx.moveTo(wall.points[i] as number, wall.points[i + 1] as number);
      else ctx.lineTo(wall.points[i] as number, wall.points[i + 1] as number);
    }
    ctx.stroke();
  }

  const rgba = ctx.getImageData(0, 0, width, height).data;
  const labels = new Uint8Array(width * height);
  for (let i = 0; i < labels.length; i++) {
    labels[i] = (rgba[i * 4 + 3] as number) >= 128 ? (rgba[i * 4] as number) : 0;
  }
  const sx = Math.floor((at.x - area.x) / spacing);
  const sy = Math.floor((at.y - area.y) / spacing);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height)
    // Fuori dalla zona esaminata c'è solo spazio vuoto e aperto.
    return { ok: false, reason: NOT_CLOSED };
  const start = labels[sy * width + sx] as number;
  if (start === WALL_LABEL) return { ok: false, reason: "Hai cliccato su un muro." };
  if (start === BIOMES.findIndex((b) => b.id === biome) + 1) {
    return { ok: false, reason: "L'area è già di questo bioma." };
  }

  const { mask, touchesBorder } = floodFill(labels, width, height, sx, sy);
  if (touchesBorder) return { ok: false, reason: NOT_CLOSED };

  const grown = dilate(mask, width, height);
  for (let tolerance = 0.75; tolerance <= 12; tolerance *= 2) {
    const contours = maskContours(grown, width, height, { threshold: 127.5, tolerance });
    const rings = contours.map((c) => {
      const ring: number[] = [];
      // Il marching squares ripete il primo punto alla fine: qui non serve.
      for (let i = 0; i + 3 < c.length; i += 2) {
        ring.push(
          area.x + ((c[i] as number) + 0.5) * spacing,
          area.y + ((c[i + 1] as number) + 0.5) * spacing,
        );
      }
      return ring;
    });
    const valid = rings.filter((r) => r.length >= 6);
    const total = valid.reduce((n, r) => n + r.length, 0);
    if (valid.length > 0 && total <= MAX_COORDINATES && valid.length <= 500) {
      return { ok: true, points: valid.flat(), rings: valid.map((r) => r.length) };
    }
  }
  return { ok: false, reason: "L'area è troppo frastagliata per essere riempita." };
}
