import { DRAW_COLORS, STROKE_WIDTHS } from "@scryboard/shared";
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
  | "calibrate";

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
};

/** Impostazioni con cui lo strumento Token piazza i nuovi token. */
export interface TokenDraft {
  name: string;
  color: string;
  size: number;
  assetId: string | null;
}

interface BoardUiState {
  tool: Tool;
  color: string;
  strokeWidth: number;
  /** Riempimento per rettangoli ed ellissi. */
  filled: boolean;
  selectedIds: string[];
  editingTextId: string | null;
  viewport: Viewport;
  /** Barra spaziatrice premuta: pan temporaneo con qualsiasi strumento. */
  spacePan: boolean;
  tokenDraft: TokenDraft;
  gridPanelOpen: boolean;
  setTool: (tool: Tool) => void;
  setColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setFilled: (filled: boolean) => void;
  select: (ids: string[]) => void;
  setEditingText: (id: string | null) => void;
  setViewport: (viewport: Viewport) => void;
  setSpacePan: (on: boolean) => void;
  setTokenDraft: (patch: Partial<TokenDraft>) => void;
  setGridPanelOpen: (open: boolean) => void;
}

export const useBoardUi = create<BoardUiState>((set) => ({
  tool: "select",
  color: DRAW_COLORS[2],
  strokeWidth: STROKE_WIDTHS[1],
  filled: false,
  selectedIds: [],
  editingTextId: null,
  viewport: { x: 0, y: 0, scale: 1 },
  spacePan: false,
  tokenDraft: { name: "", color: DRAW_COLORS[5], size: 1, assetId: null },
  gridPanelOpen: false,
  setTool: (tool) => set({ tool, selectedIds: [], editingTextId: null }),
  setColor: (color) => set({ color }),
  setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
  setFilled: (filled) => set({ filled }),
  select: (selectedIds) => set({ selectedIds }),
  setEditingText: (editingTextId) => set({ editingTextId }),
  setViewport: (viewport) => set({ viewport }),
  setSpacePan: (spacePan) => set({ spacePan }),
  setTokenDraft: (patch) => set((s) => ({ tokenDraft: { ...s.tokenDraft, ...patch } })),
  setGridPanelOpen: (gridPanelOpen) => set({ gridPanelOpen }),
}));
