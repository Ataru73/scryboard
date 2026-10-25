import { z } from "zod";
import { SCENE_ID_PATTERN } from "./documents";

/** Nome della Y.Map del documento `meta` e chiave con l'id della scena attiva. */
export const META_MAP = "meta";
export const ACTIVE_SCENE_KEY = "activeScene";

export const sceneSchema = z.object({
  id: z.string().regex(SCENE_ID_PATTERN).or(z.literal("main")),
  name: z.string().min(1).max(40),
});
export type Scene = z.infer<typeof sceneSchema>;

/** Elenco delle scene, solo per il GM. */
export const scenesResponseSchema = z.object({
  active: sceneSchema.shape.id,
  scenes: z.array(sceneSchema),
});
export type ScenesResponse = z.infer<typeof scenesResponseSchema>;

export const sceneNameRequestSchema = z.object({ name: z.string().trim().min(1).max(40) });
export type SceneNameRequest = z.infer<typeof sceneNameRequestSchema>;
