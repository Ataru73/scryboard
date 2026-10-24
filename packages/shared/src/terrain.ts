import { z } from "zod";

/** Biomi dipingibili, nell'ordine della tavolozza. */
export const BIOMES = [
  { id: "grass", label: "Erba" },
  { id: "dry-grass", label: "Prato secco" },
  { id: "forest", label: "Foresta" },
  { id: "rock", label: "Roccia" },
  { id: "gravel", label: "Ghiaia" },
  { id: "sand", label: "Sabbia" },
  { id: "snow", label: "Neve" },
  { id: "ice", label: "Ghiaccio" },
  { id: "mud", label: "Fango" },
  { id: "swamp", label: "Palude" },
  { id: "shallow-water", label: "Acqua bassa" },
  { id: "deep-water", label: "Acqua profonda" },
  { id: "lava", label: "Lava" },
] as const;

export type BiomeId = (typeof BIOMES)[number]["id"];
const BIOME_IDS = BIOMES.map((b) => b.id) as [BiomeId, ...BiomeId[]];

/** Nome della Y.Map con le operazioni di terreno (documento pubblico, scrivibile solo dal GM). */
export const TERRAIN_MAP = "terrain";

/**
 * Pennellata di terreno. Come la nebbia, le operazioni si applicano in ordine di `seq` (l'ultima
 * vince) e stanno in una Y.Map perché il server possa annullare quelle non autorizzate.
 */
export const terrainOpSchema = z.object({
  id: z.string().min(1).max(64),
  seq: z.number(),
  /** Bioma da dipingere; ignorato dalla gomma. */
  biome: z.enum(BIOME_IDS),
  mode: z.enum(["paint", "erase"]),
  /** brush: tratto a mano libera largo `width`; region: poligono chiuso dai bordi smussati. */
  shape: z.enum(["brush", "region"]),
  /** [x0, y0, x1, y1, ...] in coordinate del mondo. */
  points: z.array(z.number()).min(2).max(20000),
  width: z.number().positive().max(5000).optional(),
});
export type TerrainOp = z.infer<typeof terrainOpSchema>;
