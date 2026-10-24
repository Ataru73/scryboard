import { z } from "zod";
import type { FogOp } from "./board";
import { isFogged } from "./fog";

/** Nome della Y.Map con muri e porte (documento pubblico, modificabile dal GM). */
export const WALLS_MAP = "walls";

export const DOOR_STATES = ["open", "closed", "locked"] as const;
export type DoorState = (typeof DOOR_STATES)[number];

const barrierPoints = z
  .array(z.number())
  .min(4)
  .max(20000)
  .refine((points) => points.length % 2 === 0, "I punti vanno a coppie (x, y)");

const barrierSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.enum(["wall", "window", "invisible"]),
    /** Polilinea in coordinate assolute del mondo: [x0, y0, x1, y1, ...]. */
    points: barrierPoints,
  })
  .strict();

const doorSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.literal("door"),
    /** Una porta è un singolo segmento, così stato e icona hanno un significato univoco. */
    points: barrierPoints.length(4),
    door: z.enum(DOOR_STATES),
  })
  .strict();

/** Muro, finestra, muro invisibile o porta nella Y.Map pubblica `walls`. */
export const wallSchema = z.union([barrierSchema, doorSchema]);
export type Barrier = z.infer<typeof barrierSchema>;
export type Door = z.infer<typeof doorSchema>;
export type Wall = z.infer<typeof wallSchema>;
export type WallKind = Wall["kind"];
export type WallDraft = Omit<Barrier, "id"> | Omit<Door, "id">;

/** Le finestre bloccano il movimento ma, dalla F4, non la vista; le porte aperte non bloccano. */
export function blocksMovement(wall: Wall): boolean {
  return wall.kind !== "door" || wall.door !== "open";
}

/** Fermano la vista e la luce: muri e porte non aperte (non le finestre né i muri invisibili). */
export function blocksSight(wall: Wall): boolean {
  if (wall.kind === "door") return wall.door !== "open";
  return wall.kind === "wall";
}

/** Un giocatore può aprire e chiudere una porta, ma mai bloccarla o aprirla se è chiusa a chiave. */
export function canPlayerToggleDoor(wall: Wall | undefined): wall is Door {
  return wall?.kind === "door" && wall.door !== "locked";
}

/** Centro della porta, dove sta la sua icona. */
export function doorCenter(door: Door): { x: number; y: number } {
  return {
    x: ((door.points[0] as number) + (door.points[2] as number)) / 2,
    y: ((door.points[1] as number) + (door.points[3] as number)) / 2,
  };
}

/**
 * Porta nascosta dalla nebbia: per i giocatori non esiste finché il GM non la scopre (né si
 * vede né si può aprire). `fog` va ordinata per seq.
 */
export function isDoorFogged(door: Door, fog: FogOp[]): boolean {
  return isFogged(doorCenter(door), fog);
}
