import type { WallDraft } from "@scryboard/shared";
import type { Point } from "../board/viewport";
import type { TracedWall } from "../gemini/walls";
import { TRACE_SCALE } from "../gemini/walls";

export interface PlacedImage {
  id?: string;
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
  const attachedTo = image.id;
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
      drafts.push({
        kind: "door",
        points: [a.x, a.y, b.x, b.y],
        door: "closed",
        ...(attachedTo ? { attachedTo } : {}),
      });
    } else {
      drafts.push({
        kind: wall.kind,
        points: world.flatMap((p) => [p.x, p.y]),
        ...(attachedTo ? { attachedTo } : {}),
      });
    }
  }
  return drafts;
}

/**
 * Ricalcola i punti di un muro (coordinate del mondo) quando l'immagine a cui è ancorato
 * viene spostata, ruotata o ridimensionata.
 */
export function transformPointsWithImage(
  points: number[],
  oldImage: PlacedImage,
  newImage: PlacedImage,
): number[] {
  const oldAngle = (oldImage.rotation * Math.PI) / 180;
  const oldCos = Math.cos(oldAngle);
  const oldSin = Math.sin(oldAngle);

  const newAngle = (newImage.rotation * Math.PI) / 180;
  const newCos = Math.cos(newAngle);
  const newSin = Math.sin(newAngle);

  const out: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const wx = points[i] as number;
    const wy = points[i + 1] as number;

    const dx = wx - oldImage.x;
    const dy = wy - oldImage.y;

    // Converti dalle coordinate del mondo allo spazio locale dell'immagine originale
    const lx = dx * oldCos + dy * oldSin;
    const ly = -dx * oldSin + dy * oldCos;

    // Coordinate normalizzate (0..1) rispetto alle dimensioni dell'immagine originale
    const u = oldImage.width !== 0 ? lx / oldImage.width : 0;
    const v = oldImage.height !== 0 ? ly / oldImage.height : 0;

    // Converti da coordinate normalizzate alle nuove coordinate del mondo
    const nlx = u * newImage.width;
    const nly = v * newImage.height;

    const nx = newImage.x + nlx * newCos - nly * newSin;
    const ny = newImage.y + nlx * newSin + nly * newCos;

    out.push(Math.round(nx * 100) / 100, Math.round(ny * 100) / 100);
  }
  return out;
}
