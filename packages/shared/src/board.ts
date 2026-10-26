import { z } from "zod";

/** Livelli fissi della board, dal basso verso l'alto (il terreno dipinto sta sotto a tutti). */
export const LAYERS = ["paths", "map", "token", "draw"] as const;
export type Layer = (typeof LAYERS)[number];

/** Livelli che solo il GM può modificare: percorsi e mappe. */
export const GM_LAYERS: readonly Layer[] = ["paths", "map"];

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
/** Luce: raggi in caselle, così segue la griglia; entro `bright` piena, fino a `dim` fioca. */
export const lightSpecSchema = z.object({
  bright: z.number().min(0).max(100),
  dim: z.number().min(0).max(100),
  color,
});
export type LightSpec = z.infer<typeof lightSpecSchema>;

/** Visione di un token, in caselle: `range` 0 = illimitata; `darkvision` vede al buio. */
export const visionSpecSchema = z.object({
  range: z.number().min(0).max(1000),
  darkvision: z.number().min(0).max(1000),
});
export type VisionSpec = z.infer<typeof visionSpecSchema>;

export const DEFAULT_VISION: VisionSpec = { range: 0, darkvision: 0 };

export const tokenItemSchema = z.object({
  ...baseItem,
  kind: z.literal("token"),
  name: z.string().max(40),
  color,
  /** Immagine del token; null = cerchio colorato con le iniziali. */
  assetId: z.string().nullable(),
  size: z.number().positive().max(10),
  /** Immagine della libreria (id del catalogo); usata se non c'è un'immagine caricata. */
  portrait: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .nullable()
    .optional(),
  // Campi della F4, facoltativi: i token creati prima restano validi.
  vision: visionSpecSchema.optional(),
  /** Luce portata dal token (torcia, lanterna…). */
  light: lightSpecSchema.nullable().optional(),
  /** Utenti (id del profilo) che vedono attraverso il token, oltre a chi l'ha creato. */
  owners: z.array(z.string().max(64)).max(20).optional(),
  /**
   * Valore di iniziativa: se c'è, il token è nell'ordine dei turni (assente o null = fuori). Sta
   * sul token, così i token nascosti restano nel documento del GM insieme al loro valore.
   */
  initiative: z.number().min(-1000).max(1000).nullable().optional(),
  /**
   * Token a cui questo è agganciato (cavalcatura, veicolo): muovendo quello si muove anche questo.
   * Solo un livello: chi ha agganciati non può essere agganciato a sua volta.
   */
  attachedTo: z.string().max(64).nullable().optional(),
  /** Aura attorno al token (raggio in caselle dal bordo), visibile a tutti. */
  aura: z
    .object({ radius: z.number().positive().max(100), color })
    .nullable()
    .optional(),
  /**
   * Quota rispetto al terreno (volo, balconate, fosse), nell'unità del righello: con 5 ft a
   * casella, 15 è tre caselle più in alto. Il righello ne tiene conto.
   */
  elevation: z.number().min(-100000).max(100000).optional(),
  /**
   * Incognito: i giocatori vedono una sagoma con «?». Nome e aspetto veri stanno nel documento
   * del GM (vedi `MASKS_MAP`), così non arrivano ai giocatori nemmeno nei dati.
   */
  obscured: z.boolean().optional(),
});

/** Campi che identificano un token: per un token in incognito li conosce solo il GM. */
export const TOKEN_IDENTITY_KEYS = ["name", "color", "assetId", "portrait"] as const;
export const tokenIdentitySchema = tokenItemSchema.pick({
  name: true,
  color: true,
  assetId: true,
  portrait: true,
});
export type TokenIdentity = z.infer<typeof tokenIdentitySchema>;

/** Come un token in incognito appare nei dati che ricevono i giocatori. */
export const OBSCURED_IDENTITY: TokenIdentity = {
  name: "",
  color: "#3a3542",
  assetId: null,
  portrait: null,
};

/** Nome della Y.Map, nel documento del GM, con l'identità vera dei token in incognito (per id). */
export const MASKS_MAP = "masks";

/** Sorgente di luce fissa piazzata dal GM (sul livello mappa, quindi solo il GM la modifica). */
export const lightItemSchema = z.object({
  ...baseItem,
  kind: z.literal("light"),
  ...lightSpecSchema.shape,
});

/** Timbri: elementi di scenario disegnati proceduralmente, con varianti. */
export const STAMPS = [
  { id: "tree", label: "Albero", size: 2, group: "nature" },
  { id: "pine", label: "Pino", size: 1.5, group: "nature" },
  { id: "bush", label: "Cespuglio", size: 1, group: "nature" },
  { id: "rock", label: "Roccia", size: 0.8, group: "nature" },
  { id: "boulder", label: "Masso", size: 1.6, group: "nature" },
  { id: "barrel", label: "Barile", size: 0.7, group: "furniture" },
  { id: "crate", label: "Cassa", size: 0.8, group: "furniture" },
  { id: "table", label: "Tavolo", size: 1.6, group: "furniture" },
  { id: "chair", label: "Sedia", size: 0.6, group: "furniture" },
  { id: "bed", label: "Letto", size: 1.8, group: "furniture" },
] as const;
export type StampId = (typeof STAMPS)[number]["id"];
const STAMP_IDS = STAMPS.map((s) => s.id) as [StampId, ...StampId[]];

/**
 * Timbro sul livello mappa (lo modifica solo il GM): (x, y) è il centro, `size` il lato in
 * caselle, `variant` il seme che ne varia la forma.
 */
export const stampItemSchema = z.object({
  ...baseItem,
  kind: z.literal("stamp"),
  stamp: z.enum(STAMP_IDS),
  size: z.number().positive().max(20),
  variant: z.number().int().min(0).max(1_000_000),
});

/** Sagome d'area: cerchio, cono (largo quanto è lungo), cubo e linea larga `width` caselle. */
export const TEMPLATE_SHAPES = [
  { id: "circle", label: "Cerchio" },
  { id: "cone", label: "Cono" },
  { id: "cube", label: "Cubo" },
  { id: "line", label: "Raggio" },
] as const;
export type TemplateShape = (typeof TEMPLATE_SHAPES)[number]["id"];

/**
 * Sagoma d'area persistente, sul livello disegno così la piazzano anche i giocatori. (x, y) è
 * il punto d'origine (centro del cerchio, vertice del cono, lato del cubo o della linea) e
 * `rotation` la direzione in gradi; `size` e `width` sono in caselle.
 */
export const templateItemSchema = z.object({
  ...baseItem,
  kind: z.literal("template"),
  shape: z.enum(["circle", "cone", "cube", "line"]),
  size: z.number().positive().max(200),
  /** Larghezza della linea; ignorata dalle altre forme. */
  width: z.number().positive().max(50).optional(),
  color,
});

/** Luci tipiche, con raggi in caselle (come in D&D: 1 casella = 1,5 m). */
export const LIGHT_PRESETS = [
  { id: "candle", label: "Candela", bright: 1, dim: 2, color: "#ffd18a" },
  { id: "torch", label: "Torcia", bright: 4, dim: 8, color: "#ffb35c" },
  { id: "lantern", label: "Lanterna", bright: 6, dim: 12, color: "#ffe2a8" },
  { id: "campfire", label: "Falò", bright: 4, dim: 8, color: "#ff8a3d" },
  { id: "magic", label: "Luce magica", bright: 4, dim: 8, color: "#a8c8ff" },
] as const;

/** Stili dei percorsi, con larghezza predefinita (in caselle) e assottigliamento alle estremità. */
export const PATH_STYLES = [
  { id: "trail", label: "Sentiero", width: 0.5, taper: false },
  { id: "dirt-road", label: "Strada sterrata", width: 1, taper: false },
  { id: "paved-road", label: "Strada lastricata", width: 1.5, taper: false },
  { id: "stream", label: "Ruscello", width: 0.6, taper: true },
  { id: "river", label: "Fiume", width: 2, taper: true },
] as const;
export type PathStyleId = (typeof PATH_STYLES)[number]["id"];
const PATH_STYLE_IDS = PATH_STYLES.map((s) => s.id) as [PathStyleId, ...PathStyleId[]];

/**
 * Strada o fiume: punti di controllo relativi a (x, y), ognuno con la sua larghezza. La curva
 * passa per tutti i punti (spline di Catmull–Rom).
 */
export const pathItemSchema = z.object({
  ...baseItem,
  kind: z.literal("path"),
  style: z.enum(PATH_STYLE_IDS),
  /** [x0, y0, w0, x1, y1, w1, ...]: almeno due punti. */
  points: z
    .array(z.number())
    .min(6)
    .max(30000)
    .refine((p) => p.length % 3 === 0, "I punti vanno a terne (x, y, larghezza)")
    .refine((p) => p.every((v, i) => i % 3 !== 2 || v > 0), "Le larghezze devono essere positive"),
});

export const boardItemSchema = z.discriminatedUnion("kind", [
  imageItemSchema,
  strokeItemSchema,
  shapeItemSchema,
  textItemSchema,
  tokenItemSchema,
  pathItemSchema,
  lightItemSchema,
  stampItemSchema,
  templateItemSchema,
]);

export type ImageItem = z.infer<typeof imageItemSchema>;
export type StrokeItem = z.infer<typeof strokeItemSchema>;
export type ShapeItem = z.infer<typeof shapeItemSchema>;
export type TextItem = z.infer<typeof textItemSchema>;
export type TokenItem = z.infer<typeof tokenItemSchema>;
export type PathItem = z.infer<typeof pathItemSchema>;
export type LightItem = z.infer<typeof lightItemSchema>;
export type StampItem = z.infer<typeof stampItemSchema>;
export type TemplateItem = z.infer<typeof templateItemSchema>;
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

/** Tipi di griglia: quadrata o esagonale, con un vertice in alto (a punta) o un lato (piatta). */
export const GRID_TYPES = [
  { id: "square", label: "Quadrata" },
  { id: "hex-pointy", label: "Esagonale a punta" },
  { id: "hex-flat", label: "Esagonale piatta" },
] as const;
export type GridType = (typeof GRID_TYPES)[number]["id"];

/** Come si contano le diagonali sulla griglia quadrata (sugli esagoni non serve). */
export const DIAGONAL_RULES = [
  { id: "one", label: "Ogni diagonale vale 1 (5e)" },
  { id: "alternate", label: "1-2-1-2 (3.5, Pathfinder)" },
  { id: "euclid", label: "Distanza in linea retta" },
] as const;
export type DiagonalRule = (typeof DIAGONAL_RULES)[number]["id"];

export const gridSettingsSchema = z.object({
  enabled: z.boolean(),
  /** Le griglie salvate prima degli esagoni sono quadrate. */
  type: z.enum(["square", "hex-pointy", "hex-flat"]).default("square"),
  /**
   * Larghezza di una casella in pixel del mondo: il lato del quadrato, oppure la distanza tra due
   * lati opposti dell'esagono (cioè tra i centri di due esagoni vicini).
   */
  size: z.number().min(8).max(1000),
  /** Spostamento della griglia: per gli esagoni, il centro dell'esagono di riferimento. */
  offsetX: z.number(),
  offsetY: z.number(),
  /** Valore di una casella per il righello (es. 5 "ft"); le stanze vecchie ripiegano su 5 ft. */
  scale: z
    .object({ amount: z.number().positive().max(10000), unit: z.string().trim().max(8) })
    .default({ amount: 5, unit: "ft" }),
  diagonals: z.enum(["one", "alternate", "euclid"]).default("one"),
});
export type GridSettings = z.infer<typeof gridSettingsSchema>;

export const DEFAULT_GRID: GridSettings = {
  enabled: false,
  type: "square",
  size: 70,
  offsetX: 0,
  offsetY: 0,
  scale: { amount: 5, unit: "ft" },
  diagonals: "one",
};

/**
 * Visione dinamica: se attiva, i giocatori vedono solo ciò che vedono i loro token. Di giorno
 * tutto è illuminato, al crepuscolo un po' meno, di notte solo le luci e la scurovisione.
 */
export const lightingSettingsSchema = z.object({
  enabled: z.boolean(),
  ambient: z.enum(["day", "twilight", "night"]),
  /** Cambia quando il GM azzera le zone esplorate: i client cancellano la loro memoria. */
  explorationEpoch: z.number(),
});
export type LightingSettings = z.infer<typeof lightingSettingsSchema>;

export const DEFAULT_LIGHTING: LightingSettings = {
  enabled: false,
  ambient: "day",
  explorationEpoch: 0,
};

/**
 * Richiamo del GM: porta i giocatori su un punto con un certo ingrandimento. Si distingue un
 * richiamo dall'altro dall'id; lo scrive solo il GM (impostazioni).
 */
export const summonSchema = z.object({
  id: z.string().min(1).max(64),
  x: z.number(),
  y: z.number(),
  scale: z.number().min(0.05).max(8),
});
export type Summon = z.infer<typeof summonSchema>;

/**
 * Immagine che il GM mostra a tutto schermo ai giocatori (una lettera, un ritratto, un indizio):
 * resta aperta finché il GM non la chiude; ogni giocatore può chiuderla per sé. Ogni volta che il
 * GM la mostra ha un id nuovo, così si riapre anche per chi l'aveva chiusa.
 */
export const handoutSchema = z.object({
  id: z.string().min(1).max(64),
  assetId: z.string().min(1).max(200),
});
export type Handout = z.infer<typeof handoutSchema>;

/** Turno corrente: token attivo (se c'è ancora) e numero del round. Lo scrive solo il GM. */
export const turnSettingsSchema = z.object({
  activeId: z.string().max(64).nullable(),
  round: z.number().int().min(1).max(10000),
});
export type TurnSettings = z.infer<typeof turnSettingsSchema>;

export const DEFAULT_TURN: TurnSettings = { activeId: null, round: 1 };

/** Ordina per livello e poi per z, con l'id come spareggio stabile. */
export function compareItems(a: BoardItem, b: BoardItem): number {
  return (
    LAYERS.indexOf(a.layer) - LAYERS.indexOf(b.layer) ||
    a.z - b.z ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Nome della Y.Map con le operazioni di nebbia (documento pubblico, scrivibile solo dal GM). */
export const FOG_MAP = "fog";

/**
 * Operazione di nebbia: copre o scopre un'area. Le operazioni si applicano in ordine di `seq`;
 * sono in una Y.Map (id → op) invece che in un array perché il server deve poter annullare le
 * modifiche non autorizzate, e con le mappe conosce sempre il valore precedente.
 */
export const fogOpSchema = z.object({
  id: z.string().min(1).max(64),
  seq: z.number(),
  mode: z.enum(["cover", "reveal"]),
  /** "all" copre o scopre tutto, senza punti. */
  shape: z.enum(["rect", "polygon", "brush", "all"]),
  /** rect: [x, y, w, h]; polygon e brush: [x0, y0, x1, y1, ...]. */
  points: z.array(z.number()).max(20000),
  /** Spessore del pennello, in pixel del mondo. */
  width: z.number().positive().optional(),
});
export type FogOp = z.infer<typeof fogOpSchema>;
