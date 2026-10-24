import type { BiomeId, TerrainOp } from "@scryboard/shared";
import type { Box } from "../board/viewport";
import { terrainOpBounds } from "../terrain/geometry";
import { drawTerrainOp } from "../terrain/render";
import { maskContours } from "./contours";

const SAMPLES_PER_CELL = 8;
const MAX_CANVAS_DIMENSION = 4096;
const MAX_CANVAS_PIXELS = 4_194_304;
const MAX_WALL_COORDINATES = 20_000;
const MAX_WALL_POINTS = MAX_WALL_COORDINATES / 2;
const WORK_BUDGET_MS = 8;

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function finiteBounds(bounds: Box): boolean {
  return (
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.width > 0 &&
    bounds.height > 0
  );
}

function intersects(a: Box, b: Box): boolean {
  return (
    finiteBounds(a) &&
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

function rasterSize(worldWidth: number, worldHeight: number, desiredSpacing: number) {
  let spacing = Math.max(
    desiredSpacing,
    worldWidth / (MAX_CANVAS_DIMENSION - 1),
    worldHeight / (MAX_CANVAS_DIMENSION - 1),
    Math.sqrt((worldWidth * worldHeight) / MAX_CANVAS_PIXELS),
  );

  // Il +1 dei campioni e gli arrotondamenti possono superare i limiti calcolati in continuo.
  for (let attempt = 0; attempt < 32; attempt++) {
    const width = Math.ceil(worldWidth / spacing) + 1;
    const height = Math.ceil(worldHeight / spacing) + 1;
    if (
      width <= MAX_CANVAS_DIMENSION &&
      height <= MAX_CANVAS_DIMENSION &&
      width * height <= MAX_CANVAS_PIXELS
    ) {
      return { width, height, spacing };
    }
    const factor = Math.max(
      width / MAX_CANVAS_DIMENSION,
      height / MAX_CANVAS_DIMENSION,
      Math.sqrt((width * height) / MAX_CANVAS_PIXELS),
    );
    spacing *= factor * 1.000001;
  }
  throw new RangeError("Unable to fit terrain bounds into a bounded raster");
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("A 2D canvas context is required to extract terrain walls");
  return { canvas, context };
}

function signedArea(points: number[]): number {
  let area = 0;
  for (let i = 0; i + 3 < points.length; i += 2) {
    area +=
      (points[i] as number) * (points[i + 3] as number) -
      (points[i + 2] as number) * (points[i + 1] as number);
  }
  return area / 2;
}

/** Spezza senza aggiungere corde: un vertice condiviso collega due pezzi consecutivi. */
function splitWallPoints(points: number[]): number[][] {
  if (points.length <= MAX_WALL_COORDINATES) return [points];
  const count = points.length / 2;
  const pieces: number[][] = [];
  for (let start = 0; start < count - 1; ) {
    const end = Math.min(start + MAX_WALL_POINTS - 1, count - 1);
    pieces.push(points.slice(start * 2, (end + 1) * 2));
    if (end === count - 1) break;
    start = end;
  }
  return pieces;
}

/**
 * Ricostruisce la maschera finale di un bioma e ne restituisce i bordi in mondo. Le operazioni
 * sono elaborate a piccoli blocchi, cedendo il controllo al browser fra un blocco e il successivo.
 * `ops` deve essere già ordinato per `seq`: paint del bioma aggiunge; gomme e paint di altri biomi
 * sottraggono. Ogni loop chiuso ripete il primo punto alla fine. I loop oltre 20.000 numeri sono
 * eccezionalmente divisi in archi consecutivi, ciascuno entro il limite di `Wall.points`.
 *
 * Le texture sono generate localmente da `drawTerrainOp`: non vengono caricati asset esterni.
 */
export async function terrainWallContours(
  ops: TerrainOp[],
  biome: BiomeId,
  cellSize: number,
): Promise<number[][]> {
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new RangeError("cellSize must be a positive finite number");
  }

  let bounds: Box | null = null;
  for (const op of ops) {
    if (op.mode !== "paint" || op.biome !== biome) continue;
    const next = terrainOpBounds(op);
    if (!finiteBounds(next)) continue;
    bounds = bounds
      ? {
          x: Math.min(bounds.x, next.x),
          y: Math.min(bounds.y, next.y),
          width:
            Math.max(bounds.x + bounds.width, next.x + next.width) - Math.min(bounds.x, next.x),
          height:
            Math.max(bounds.y + bounds.height, next.y + next.height) - Math.min(bounds.y, next.y),
        }
      : next;
  }
  if (!bounds) return [];

  const desiredSpacing = cellSize / SAMPLES_PER_CELL;
  const padding = cellSize / 4;
  const originX = bounds.x - padding;
  const originY = bounds.y - padding;
  const worldWidth = bounds.width + padding * 2;
  const worldHeight = bounds.height + padding * 2;
  if (![originX, originY, worldWidth, worldHeight].every(Number.isFinite)) return [];
  const { width, height, spacing } = rasterSize(worldWidth, worldHeight, desiredSpacing);

  const target = createCanvas(width, height);
  const operation = createCanvas(width, height);
  const scale = 1 / spacing;
  let sliceStarted = performance.now();

  for (const op of ops) {
    if (!intersects(terrainOpBounds(op), bounds)) continue;

    operation.context.setTransform(1, 0, 0, 1, 0, 0);
    operation.context.globalCompositeOperation = "source-over";
    operation.context.globalAlpha = 1;
    operation.context.clearRect(0, 0, width, height);
    operation.context.setTransform(scale, 0, 0, scale, -originX * scale, -originY * scale);

    // Anche una gomma deve prima produrre una maschera piena: destination-out su un canvas
    // temporaneo vuoto non disegnerebbe nulla. La sottrazione avviene soltanto sul target.
    const maskOp: TerrainOp = { ...op, mode: "paint", biome };
    drawTerrainOp(operation.context, maskOp);

    target.context.save();
    target.context.setTransform(1, 0, 0, 1, 0, 0);
    target.context.globalCompositeOperation =
      op.mode === "paint" && op.biome === biome ? "source-over" : "destination-out";
    target.context.drawImage(operation.canvas, 0, 0);
    target.context.restore();
    if (performance.now() - sliceStarted >= WORK_BUDGET_MS) {
      await yieldToBrowser();
      sliceStarted = performance.now();
    }
  }

  const rgba = target.context.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = rgba[i * 4 + 3] as number;

  const contours = maskContours(mask, width, height, {
    threshold: 127.5,
    tolerance: 0.75,
  });
  const result: number[][] = [];
  for (const contour of contours) {
    const world: number[] = [];
    for (let i = 0; i + 1 < contour.length; i += 2) {
      // I pixel di ImageData sono campionati al loro centro (+0,5), non al bordo superiore.
      world.push(
        originX + ((contour[i] as number) + 0.5) * spacing,
        originY + ((contour[i + 1] as number) + 0.5) * spacing,
      );
    }
    if (
      world.length < 8 ||
      !world.every(Number.isFinite) ||
      !Number.isFinite(signedArea(world)) ||
      signedArea(world) === 0
    ) {
      continue;
    }
    result.push(...splitWallPoints(world));
  }
  return result;
}
