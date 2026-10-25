import type { WallDraft } from "@scryboard/shared";
import type { Point } from "../board/viewport";
import type { TracedWall } from "../gemini/walls";
import { TRACE_SCALE } from "../gemini/walls";

export interface PlacedImage {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Gradi, in senso orario attorno all'angolo in alto a sinistra (come Konva). */
  rotation: number;
}

/**
 * Porta i muri tracciati da Gemini (scala 0–1000 sull'immagine) nelle coordinate del mondo,
 * tenendo conto di posizione, dimensione e rotazione dell'immagine. I vertici si agganciano con
 * `snap`; i muri che dopo l'aggancio perdono i punti distinti vengono scartati, e le porte
 * restano un solo segmento tra il primo e l'ultimo punto.
 */
export function projectTrace(
  traced: TracedWall[],
  image: PlacedImage,
  snap: (point: Point) => Point = (p) => p,
): WallDraft[] {
  const angle = (image.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const toWorld = (p: { x: number; y: number }): Point => {
    const lx = (p.x / TRACE_SCALE) * image.width;
    const ly = (p.y / TRACE_SCALE) * image.height;
    return snap({ x: image.x + lx * cos - ly * sin, y: image.y + lx * sin + ly * cos });
  };

  const drafts: WallDraft[] = [];
  for (const wall of traced) {
    const world: Point[] = [];
    for (const p of wall.points.map(toWorld)) {
      const last = world[world.length - 1];
      if (!last || last.x !== p.x || last.y !== p.y) world.push(p);
    }
    if (world.length < 2) continue;
    if (wall.kind === "door") {
      const a = world[0] as Point;
      const b = world[world.length - 1] as Point;
      drafts.push({ kind: "door", points: [a.x, a.y, b.x, b.y], door: "closed" });
    } else {
      drafts.push({ kind: wall.kind, points: world.flatMap((p) => [p.x, p.y]) });
    }
  }
  return drafts;
}
