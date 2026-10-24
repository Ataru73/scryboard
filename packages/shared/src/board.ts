import { z } from "zod";

/** Livelli fissi della board, dal basso verso l'alto. */
export const LAYERS = ["map", "token", "draw"] as const;
export type Layer = (typeof LAYERS)[number];

const baseItem = {
  id: z.string().min(1).max(64),
  layer: z.enum(LAYERS),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  /** Ordine all'interno del livello: valori più alti stanno sopra. */
  z: z.number(),
  locked: z.boolean(),
  createdBy: z.string(),
};

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const imageItemSchema = z.object({
  ...baseItem,
  kind: z.literal("image"),
  assetId: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const strokeItemSchema = z.object({
  ...baseItem,
  kind: z.literal("stroke"),
  /** Coordinate relative a (x, y): [x0, y0, x1, y1, ...]. */
  points: z.array(z.number()).min(2),
  color,
  strokeWidth: z.number().positive(),
});

export const shapeItemSchema = z.object({
  ...baseItem,
  kind: z.literal("shape"),
  shape: z.enum(["rect", "ellipse", "line"]),
  /** Per le linee: vettore dal punto iniziale (x, y) a quello finale; può essere negativo. */
  width: z.number(),
  height: z.number(),
  color,
  strokeWidth: z.number().positive(),
  fill: color.nullable(),
});

export const textItemSchema = z.object({
  ...baseItem,
  kind: z.literal("text"),
  text: z.string().max(5000),
  fontSize: z.number().positive(),
  color,
  /** Larghezza del box di testo; null = si adatta al contenuto. */
  width: z.number().positive().nullable(),
});

/**
 * Pedina su griglia. A differenza degli altri oggetti, (x, y) è il centro; il diametro è
 * `size` caselle, così i token seguono la griglia se la si ricalibra.
 */
export const tokenItemSchema = z.object({
  ...baseItem,
  kind: z.literal("token"),
  name: z.string().max(40),
  color,
  /** Immagine del token; null = cerchio colorato con le iniziali. */
  assetId: z.string().nullable(),
  size: z.number().positive().max(10),
});

export const boardItemSchema = z.discriminatedUnion("kind", [
  imageItemSchema,
  strokeItemSchema,
  shapeItemSchema,
  textItemSchema,
  tokenItemSchema,
]);

export type ImageItem = z.infer<typeof imageItemSchema>;
export type StrokeItem = z.infer<typeof strokeItemSchema>;
export type ShapeItem = z.infer<typeof shapeItemSchema>;
export type TextItem = z.infer<typeof textItemSchema>;
export type TokenItem = z.infer<typeof tokenItemSchema>;
export type BoardItem = z.infer<typeof boardItemSchema>;
export type BoardItemKind = BoardItem["kind"];

/** Nome della Y.Map con gli oggetti in ogni documento della stanza. */
export const ITEMS_MAP = "items";

export const DRAW_COLORS = [
  "#1d1a24",
  "#ffffff",
  "#e5484d",
  "#f76b15",
  "#ffc53d",
  "#46a758",
  "#0090ff",
  "#8e4ec6",
] as const;

export const STROKE_WIDTHS = [2, 4, 8, 16] as const;

/** Taglie dei token in caselle, con i nomi delle categorie di D&D. */
export const TOKEN_SIZES = [
  { size: 0.5, label: "Minuscola" },
  { size: 1, label: "Media" },
  { size: 2, label: "Grande" },
  { size: 3, label: "Enorme" },
  { size: 4, label: "Mastodontica" },
] as const;

/** Nome della Y.Map con le impostazioni della board (documento pubblico). */
export const SETTINGS_MAP = "settings";

export const gridSettingsSchema = z.object({
  enabled: z.boolean(),
  /** Lato di una casella, in pixel del mondo. */
  size: z.number().min(8).max(1000),
  /** Spostamento della griglia, in [0, size). */
  offsetX: z.number(),
  offsetY: z.number(),
});
export type GridSettings = z.infer<typeof gridSettingsSchema>;

export const DEFAULT_GRID: GridSettings = { enabled: false, size: 70, offsetX: 0, offsetY: 0 };

/** Ordina per livello e poi per z, con l'id come spareggio stabile. */
export function compareItems(a: BoardItem, b: BoardItem): number {
  return (
    LAYERS.indexOf(a.layer) - LAYERS.indexOf(b.layer) ||
    a.z - b.z ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
