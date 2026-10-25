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
  { id: "wood", label: "Legno" },
] as const;

export type BiomeId = (typeof BIOMES)[number]["id"];
const BIOME_IDS = BIOMES.map((b) => b.id) as [BiomeId, ...BiomeId[]];

/** Nome della Y.Map con le operazioni di terreno (documento pubblico, scrivibile solo dal GM). */
export const TERRAIN_MAP = "terrain";

/**
 * Pennellata di terreno. Come la nebbia, le operazioni si applicano in ordine di `seq` (l'ultima
 * vince) e stanno in una Y.Map perché il server possa annullare quelle non autorizzate.
 */
export const terrainOpSchema = z
  .object({
    id: z.string().min(1).max(64),
    seq: z.number(),
    /** Bioma da dipingere; ignorato dalla gomma. */
    biome: z.enum(BIOME_IDS),
    mode: z.enum(["paint", "erase"]),
    /**
     * brush: tratto a mano libera largo `width`; region: poligono chiuso dai bordi smussati;
     * fill: area riempita, uno o più anelli esatti (con i buchi) senza smussatura.
     */
    shape: z.enum(["brush", "region", "fill"]),
    /** [x0, y0, x1, y1, ...] in coordinate del mondo (per fill, gli anelli uno dopo l'altro). */
    points: z.array(z.number()).min(2).max(20000),
    width: z.number().positive().max(5000).optional(),
    /** Solo fill: quanti numeri di `points` appartengono a ogni anello. */
    rings: z.array(z.number().int().min(6)).max(500).optional(),
    /** Ritaglio [x, y, w, h]: l'operazione si vede solo lì (terreno incollato da un'altra zona). */
    clip: z.array(z.number()).length(4).optional(),
    /** Solo region: non interpola i punti (niente smussatura né rumore), riempie la regione esatta. */
    exact: z.boolean().optional(),
  })
  .refine(
    (op) =>
      op.shape !== "fill" ||
      (op.rings?.every((n) => n % 2 === 0) === true &&
        op.rings.reduce((a, b) => a + b, 0) === op.points.length),
    "Gli anelli del riempimento devono coprire esattamente i punti",
  );
export type TerrainOp = z.infer<typeof terrainOpSchema>;
