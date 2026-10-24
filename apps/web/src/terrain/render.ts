import type { TerrainOp } from "@scryboard/shared";
import { brushCircles, regionOutline, terrainOpBounds } from "./geometry";
import { biomePattern } from "./textures";

/** Larghezza della sfumatura sul bordo, in pixel del mondo. */
export function edgeWidth(op: TerrainOp): number {
  return op.shape === "brush" ? Math.min(24, Math.max(2, ((op.width ?? 40) / 2) * 0.3)) : 10;
}

/** Canvas di lavoro riusato tra un'operazione e l'altra. */
let scratch: HTMLCanvasElement | null = null;

function scratchContext(width: number, height: number): CanvasRenderingContext2D {
  if (!scratch) scratch = document.createElement("canvas");
  if (scratch.width < width || scratch.height < height) {
    scratch.width = Math.max(scratch.width, width);
    scratch.height = Math.max(scratch.height, height);
  }
  const ctx = scratch.getContext("2d") as CanvasRenderingContext2D;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

/**
 * Sotto questa scala (pixel del canvas per pixel del mondo) il bordo irregolare non si vede:
 * la pennellata diventa una linea spessa, molto più economica di centinaia di cerchi.
 */
const DETAIL_SCALE = 0.5;

function shapePath(ctx: CanvasRenderingContext2D, op: TerrainOp, shrink: number, scale: number) {
  ctx.beginPath();
  if (op.shape === "brush" && scale < DETAIL_SCALE) {
    for (let i = 0; i + 1 < op.points.length; i += 2) {
      if (i === 0) ctx.moveTo(op.points[i] as number, op.points[i + 1] as number);
      else ctx.lineTo(op.points[i] as number, op.points[i + 1] as number);
    }
    // Un punto solo: un segmento minimo, così la linea con estremi rotondi diventa un disco.
    if (op.points.length < 4) ctx.lineTo((op.points[0] as number) + 0.01, op.points[1] as number);
  } else if (op.shape === "brush") {
    for (const [x, y, r] of brushCircles(op)) {
      const radius = Math.max(0.5, r - shrink);
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
  } else {
    const outline = regionOutline(op);
    for (let i = 0; i + 1 < outline.length; i += 2) {
      if (i === 0) ctx.moveTo(outline[i] as number, outline[i + 1] as number);
      else ctx.lineTo(outline[i] as number, outline[i + 1] as number);
    }
    ctx.closePath();
  }
}

/**
 * Disegna un'operazione di terreno sul contesto, già trasformato in coordinate del mondo.
 *
 * Sul canvas di lavoro si disegna la forma sfocata (una maschera dai bordi morbidi) e la si
 * riempie con la texture del bioma (source-in): il bordo sfuma nel bioma sottostante senza
 * sfocare la texture. La gomma usa la stessa maschera con destination-out.
 */
export function drawTerrainOp(ctx: CanvasRenderingContext2D, op: TerrainOp) {
  const m = ctx.getTransform();
  const scale = m.a;
  const edge = edgeWidth(op);
  const blurPx = edge * scale * 0.5;
  const asLine = op.shape === "brush" && scale < DETAIL_SCALE;
  const fillShape = (
    target: CanvasRenderingContext2D,
    style: string | CanvasPattern,
    shrink: number,
  ) => {
    shapePath(target, op, shrink, scale);
    if (asLine) {
      target.lineCap = "round";
      target.lineJoin = "round";
      target.lineWidth = Math.max(1, (op.width ?? 40) - 2 * shrink);
      target.strokeStyle = style;
      target.stroke();
    } else {
      target.fillStyle = style;
      target.fill();
    }
  };

  // Sfumatura di un pixel o poco più (da lontano): si disegna direttamente sul tassello, senza
  // canvas di lavoro; la differenza non si vede e costa molto meno.
  if (blurPx < 1.5 || scale < DETAIL_SCALE * 0.7) {
    ctx.save();
    if (op.mode === "erase") ctx.globalCompositeOperation = "destination-out";
    fillShape(ctx, op.mode === "erase" ? "#000000" : biomePattern(ctx, op.biome), 0);
    ctx.restore();
    return;
  }

  const bounds = terrainOpBounds(op);
  // Riquadro dell'operazione in pixel del canvas, ritagliato al canvas.
  const left = Math.max(0, Math.floor(bounds.x * scale + m.e));
  const top = Math.max(0, Math.floor(bounds.y * scale + m.f));
  const right = Math.min(ctx.canvas.width, Math.ceil((bounds.x + bounds.width) * scale + m.e));
  const bottom = Math.min(ctx.canvas.height, Math.ceil((bounds.y + bounds.height) * scale + m.f));
  if (right <= left || bottom <= top) return;

  const width = right - left;
  const height = bottom - top;
  const work = scratchContext(width, height);
  work.setTransform(scale, 0, 0, scale, m.e - left, m.f - top);

  // La sfocatura allarga la forma: la si restringe di metà sfumatura per restare al suo posto.
  if ("filter" in work) {
    work.filter = `blur(${blurPx}px)`;
    fillShape(work, "#000000", edge * 0.5);
    work.filter = "none";
  } else {
    fillShape(work, "#000000", 0);
  }

  if (op.mode === "paint") {
    work.globalCompositeOperation = "source-in";
    work.fillStyle = biomePattern(work, op.biome);
    work.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = op.mode === "erase" ? "destination-out" : "source-over";
  ctx.drawImage(scratch as HTMLCanvasElement, 0, 0, width, height, left, top, width, height);
  ctx.restore();
}
