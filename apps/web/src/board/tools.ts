import {
  BIOMES,
  type BiomeId,
  DRAW_COLORS,
  type LIGHT_PRESETS,
  PATH_STYLES,
  type PathStyleId,
  STROKE_WIDTHS,
  type StampId,
  type TerrainOp,
  type WallKind,
} from "@scryboard/shared";
import { create } from "zustand";
import type { Viewport } from "./viewport";

export type Tool =
  | "select"
  | "hand"
  | "pen"
  | "line"
  | "rect"
  | "ellipse"
  | "text"
  | "eraser"
  | "token"
  /** Solo GM: traccia una casella sulla mappa per calibrare la griglia. */
  | "calibrate"
  /** Solo GM: copre o scopre aree con la nebbia. */
  | "fog"
  /** Solo GM: dipinge i biomi del terreno. */
  | "terrain"
  /** Solo GM: strade e fiumi. */
  | "path"
  /** Solo GM: muri, porte, finestre e barriere invisibili. */
  | "wall"
  /** Solo GM: sorgenti di luce e impostazioni della visione. */
  | "light"
  /** Solo GM: timbri di scenario (alberi, rocce, mobili). */
  | "stamp";

export const TOOL_SHORTCUTS: Record<string, Tool> = {
  v: "select",
  h: "hand",
  p: "pen",
  l: "line",
  r: "rect",
  o: "ellipse",
  t: "text",
  e: "eraser",
  k: "token",
  f: "fog",
  b: "terrain",
  j: "path",
  w: "wall",
  i: "light",
  s: "stamp",
};

/** Strumenti riservati al GM: le scorciatoie non li attivano per i giocatori. */
export const GM_TOOLS: Tool[] = ["calibrate", "fog", "terrain", "path", "wall", "light", "stamp"];

/** Larghezze dei percorsi, in caselle della griglia. */
export const PATH_WIDTHS = [0.5, 1, 1.5, 2, 3] as const;

export type FogMode = "cover" | "reveal";
export type FogShape = "rect" | "polygon" | "brush";
export type TerrainMode = "brush" | "region" | "erase" | "fill" | "copy" | "paste";

/** Porzione di terreno copiata: le operazioni che la compongono e il riquadro di origine. */
export interface TerrainClipboard {
  box: { x: number; y: number; width: number; height: number };
  ops: TerrainOp[];
}
/** Larghezze del pennello del terreno, in caselle della griglia. */
export const TERRAIN_SIZES = [0.5, 1, 2, 4] as const;

/** Impostazioni con cui lo strumento Token piazza i nuovi token. */
export interface TokenDraft {
  name: string;
  color: string;
  size: number;
  assetId: string | null;
  /** Immagine della libreria (id del catalogo). */
  portrait?: string | null;
}

interface BoardUiState {
  tool: Tool;
  color: string;
  strokeWidth: number;
  /** Riempimento per rettangoli ed ellissi. */
  filled: boolean;
  selectedIds: string[];
  /** Punto di controllo selezionato del percorso selezionato. */
  pathPoint: number | null;
  editingTextId: string | null;
  viewport: Viewport;
  /** Barra spaziatrice premuta: pan temporaneo con qualsiasi strumento. */
  spacePan: boolean;
  tokenDraft: TokenDraft;
  gridPanelOpen: boolean;
  fogMode: FogMode;
  fogShape: FogShape;
  /** Spessore del pennello della nebbia, in pixel dello schermo. */
  fogBrush: number;
  /** Solo GM: i nuovi oggetti nascono nascosti ai giocatori. */
  createHidden: boolean;
  terrainBiome: BiomeId;
  terrainMode: TerrainMode;
  /** In caselle: la larghezza segue la griglia. */
  terrainSize: number;
  /** Pittura nascosta: ogni pennellata nasce coperta dalla nebbia. */
  terrainUnderFog: boolean;
  terrainClipboard: TerrainClipboard | null;
  /** Biomi usati di recente, il primo è il più recente (tasti 1–9). */
  recentBiomes: BiomeId[];
  pathStyle: PathStyleId;
  /** Larghezza dei nuovi punti del percorso, in caselle. */
  pathWidth: number;
  wallKind: WallKind;
  /** Bioma usato per generare automaticamente i muri dal suo contorno. */
  wallBiome: BiomeId;
  /** Muri selezionati con lo strumento Seleziona (separati dagli oggetti board). */
  selectedWallId: string | null;
  /** Luce che lo strumento Luce piazza. */
  lightPreset: (typeof LIGHT_PRESETS)[number]["id"];
  /** Solo GM: vede la lavagna come la vede questo giocatore (id del profilo). */
  visionPreview: string | null;
  stampId: StampId;
  /** Rotazione, taglia e variante casuali a ogni timbro, per un aspetto naturale. */
  stampRandom: boolean;
  setTool: (tool: Tool) => void;
  setColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setFilled: (filled: boolean) => void;
  select: (ids: string[]) => void;
  setPathPoint: (index: number | null) => void;
  setEditingText: (id: string | null) => void;
  setViewport: (viewport: Viewport) => void;
  setSpacePan: (on: boolean) => void;
  setTokenDraft: (patch: Partial<TokenDraft>) => void;
  setGridPanelOpen: (open: boolean) => void;
  setFog: (patch: Partial<Pick<BoardUiState, "fogMode" | "fogShape" | "fogBrush">>) => void;
  setCreateHidden: (on: boolean) => void;
  /** Cambiando stile si riparte dalla sua larghezza tipica. */
  setPathStyle: (style: PathStyleId) => void;
  setPathWidth: (width: number) => void;
  setWall: (patch: Partial<Pick<BoardUiState, "wallKind" | "wallBiome">>) => void;
  selectWall: (id: string | null) => void;
  setLightPreset: (preset: BoardUiState["lightPreset"]) => void;
  setVisionPreview: (viewerId: string | null) => void;
  setStamp: (patch: Partial<Pick<BoardUiState, "stampId" | "stampRandom">>) => void;
  setTerrain: (
    patch: Partial<
      Pick<
        BoardUiState,
        "terrainBiome" | "terrainMode" | "terrainSize" | "terrainUnderFog" | "terrainClipboard"
      >
    >,
  ) => void;
  /** Segna un bioma come usato: entra in testa alla tavolozza rapida. */
  noteBiomeUsed: (biome: BiomeId) => void;
}

const RECENT_KEY = "scryboard:recent-biomes";

/** Tavolozza rapida: ricordata nel browser; all'inizio i primi biomi della lista. */
function loadRecentBiomes(): BiomeId[] {
  const valid = new Set<string>(BIOMES.map((b) => b.id));
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
    const list = saved.filter((b): b is BiomeId => valid.has(b));
    if (list.length > 0) return list.slice(0, 9);
  } catch {
    // Memoria non disponibile: si parte dalla lista predefinita.
  }
  return BIOMES.slice(0, 9).map((b) => b.id);
}

function saveRecentBiomes(list: BiomeId[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Ignorato: la tavolozza vale solo per questa sessione.
  }
}

export const useBoardUi = create<BoardUiState>((set) => ({
  tool: "select",
  color: DRAW_COLORS[2],
  strokeWidth: STROKE_WIDTHS[1],
  filled: false,
  selectedIds: [],
  pathPoint: null,
  editingTextId: null,
  viewport: { x: 0, y: 0, scale: 1 },
  spacePan: false,
  tokenDraft: { name: "", color: DRAW_COLORS[5], size: 1, assetId: null, portrait: null },
  gridPanelOpen: false,
  fogMode: "cover",
  fogShape: "rect",
  fogBrush: 60,
  createHidden: false,
  terrainBiome: "grass",
  terrainMode: "brush",
  terrainSize: 1,
  terrainUnderFog: false,
  terrainClipboard: null,
  recentBiomes: loadRecentBiomes(),
  pathStyle: "dirt-road",
  pathWidth: 1,
  wallKind: "wall",
  wallBiome: "rock",
  selectedWallId: null,
  lightPreset: "torch",
  visionPreview: null,
  stampId: "tree",
  stampRandom: true,
  setTool: (tool) =>
    set({ tool, selectedIds: [], pathPoint: null, selectedWallId: null, editingTextId: null }),
  setColor: (color) => set({ color }),
  setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
  setFilled: (filled) => set({ filled }),
  select: (selectedIds) => set({ selectedIds, pathPoint: null, selectedWallId: null }),
  setPathPoint: (pathPoint) => set({ pathPoint }),
  setEditingText: (editingTextId) => set({ editingTextId }),
  setViewport: (viewport) => set({ viewport }),
  setSpacePan: (spacePan) => set({ spacePan }),
  setTokenDraft: (patch) => set((s) => ({ tokenDraft: { ...s.tokenDraft, ...patch } })),
  setGridPanelOpen: (gridPanelOpen) => set({ gridPanelOpen }),
  setFog: (patch) => set(patch),
  setCreateHidden: (createHidden) => set({ createHidden }),
  setTerrain: (patch) => set(patch),
  noteBiomeUsed: (biome) =>
    set((s) => {
      const recentBiomes = [biome, ...s.recentBiomes.filter((b) => b !== biome)].slice(0, 9);
      saveRecentBiomes(recentBiomes);
      return { recentBiomes };
    }),
  setPathStyle: (pathStyle) =>
    set({ pathStyle, pathWidth: PATH_STYLES.find((s) => s.id === pathStyle)?.width ?? 1 }),
  setPathWidth: (pathWidth) => set({ pathWidth: Math.min(8, Math.max(0.25, pathWidth)) }),
  setWall: (patch) => set(patch),
  selectWall: (selectedWallId) => set({ selectedWallId, selectedIds: [], pathPoint: null }),
  setLightPreset: (lightPreset) => set({ lightPreset }),
  setVisionPreview: (visionPreview) => set({ visionPreview }),
  setStamp: (patch) => set(patch),
}));
