import { z } from "zod";

/** Stato di presenza condiviso tramite l'awareness di Yjs (non persistito). */
export const presenceUserSchema = z.object({
  /** Id del profilo: serve al GM per assegnare i token ai giocatori. */
  id: z.string().max(64).optional(),
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  role: z.enum(["gm", "player"]),
  /**
   * Schermo condiviso al tavolo (TV, proiettore): entra come un giocatore ma non è un giocatore,
   * quindi non riceve messaggi né token e non conta per la visione del gruppo.
   */
  projector: z.boolean().optional(),
});
export type PresenceUser = z.infer<typeof presenceUserSchema>;

export const presenceCursorSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const draftStrokeSchema = z.object({
  origin: presenceCursorSchema,
  points: z.array(z.number().finite()).min(2).max(20000),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  strokeWidth: z.number().positive().max(100),
});
export type DraftStroke = z.infer<typeof draftStrokeSchema>;

export const presencePingSchema = z.object({
  id: z.string().max(64),
  x: z.number().finite(),
  y: z.number().finite(),
});
export type Ping = z.infer<typeof presencePingSchema>;

export const rulerStateSchema = z.object({
  points: z.array(z.number().finite()).min(2).max(1000),
  rise: z.number().finite().optional(),
});
export type RulerState = z.infer<typeof rulerStateSchema>;

export const templateGeometrySchema = z.object({
  shape: z.enum(["circle", "cone", "cube", "line"]),
  x: z.number().finite(),
  y: z.number().finite(),
  rotation: z.number().finite(),
  size: z.number().positive().max(200),
  width: z.number().positive().max(50).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type PresenceTemplate = z.infer<typeof templateGeometrySchema>;

export const PLAYER_COLORS = [
  "#e5484d",
  "#f76b15",
  "#ffc53d",
  "#46a758",
  "#12a594",
  "#0090ff",
  "#8e4ec6",
  "#d6409f",
] as const;
