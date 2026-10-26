import { z } from "zod";

/**
 * Schema del formato Universal VTT (`.uvtt`, `.dd2vtt`, `.df2vtt`): solo i campi che si importano.
 * Le coordinate sono in caselle, a partire da `map_origin`; l'immagine è in base64.
 */
const point = z.object({ x: z.number(), y: z.number() });
const polyline = z.array(point);

export const uvttSchema = z.object({
  resolution: z.object({
    map_origin: point.default({ x: 0, y: 0 }),
    map_size: point,
    pixels_per_grid: z.number().positive(),
  }),
  line_of_sight: z.array(polyline).nullish(),
  objects_line_of_sight: z.array(polyline).nullish(),
  portals: z
    .array(z.object({ bounds: z.array(point).min(2), closed: z.boolean().optional() }))
    .nullish(),
  lights: z
    .array(
      z.object({
        position: point,
        range: z.number().nonnegative(),
        color: z.string().optional(),
      }),
    )
    .nullish(),
  image: z.string().min(1),
});
