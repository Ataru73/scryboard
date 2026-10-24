import { DRAW_COLORS, type Role, STROKE_WIDTHS } from "@scryboard/shared";
import { useRef, useSyncExternalStore } from "react";
import { COLOR_NAMES } from "./colors";
import { GridPanel } from "./GridPanel";
import { FitIcon, GridIcon, ImageIcon, RedoIcon, TOOL_ICONS, UndoIcon } from "./icons";
import type { BoardStore } from "./store";
import { TokenStyleFields } from "./TokenStyleFields";
import { type Tool, useBoardUi } from "./tools";
import { clampScale, zoomAt } from "./viewport";

const TOOLS: { tool: Tool; label: string; key: string }[] = [
  { tool: "select", label: "Seleziona", key: "V" },
  { tool: "hand", label: "Sposta la vista", key: "H" },
  { tool: "pen", label: "Matita", key: "P" },
  { tool: "line", label: "Linea", key: "L" },
  { tool: "rect", label: "Rettangolo", key: "R" },
  { tool: "ellipse", label: "Ellisse", key: "O" },
  { tool: "text", label: "Testo", key: "T" },
  { tool: "eraser", label: "Gomma", key: "E" },
  { tool: "token", label: "Token", key: "K" },
];

const DRAWING_TOOLS: Tool[] = ["pen", "line", "rect", "ellipse", "text"];

interface Props {
  store: BoardStore;
  role: Role;
  roomId: string;
  onUpload: (files: File[]) => void;
  onFit: () => void;
  viewportSize: { width: number; height: number };
}

export function Toolbar({ store, role, roomId, onUpload, onFit, viewportSize }: Props) {
  const { tool, color, strokeWidth, filled, viewport, tokenDraft, gridPanelOpen } = useBoardUi();
  const {
    setTool,
    setColor,
    setStrokeWidth,
    setFilled,
    setViewport,
    setTokenDraft,
    setGridPanelOpen,
  } = useBoardUi.getState();
  const canUndo = useSyncExternalStore(store.subscribe, () => store.canUndo());
  const canRedo = useSyncExternalStore(store.subscribe, () => store.canRedo());
  const fileInput = useRef<HTMLInputElement>(null);
  const center = { x: viewportSize.width / 2, y: viewportSize.height / 2 };

  return (
    <>
      <div className="toolbar toolbar-tools" role="toolbar" aria-label="Strumenti">
        {TOOLS.map((t) => (
          <button
            key={t.tool}
            type="button"
            className="icon-button"
            aria-pressed={tool === t.tool}
            title={`${t.label} (${t.key})`}
            aria-label={t.label}
            onClick={() => setTool(t.tool)}
          >
            {TOOL_ICONS[t.tool]}
          </button>
        ))}
        <span className="toolbar-separator" />
        <button
          type="button"
          className="icon-button"
          title="Carica immagine (puoi anche trascinarla o incollarla)"
          aria-label="Carica immagine"
          onClick={() => fileInput.current?.click()}
        >
          {ImageIcon}
        </button>
        {role === "gm" && (
          <button
            type="button"
            className="icon-button"
            title="Griglia"
            aria-label="Griglia"
            aria-pressed={gridPanelOpen}
            onClick={() => setGridPanelOpen(!gridPanelOpen)}
          >
            {GridIcon}
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            onUpload(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <span className="toolbar-separator" />
        <button
          type="button"
          className="icon-button"
          title="Annulla (Ctrl+Z)"
          aria-label="Annulla"
          disabled={!canUndo}
          onClick={() => store.undo()}
        >
          {UndoIcon}
        </button>
        <button
          type="button"
          className="icon-button"
          title="Ripeti (Ctrl+Shift+Z)"
          aria-label="Ripeti"
          disabled={!canRedo}
          onClick={() => store.redo()}
        >
          {RedoIcon}
        </button>
      </div>

      {tool === "token" && (
        <div className="toolbar toolbar-style" role="toolbar" aria-label="Nuovo token">
          <TokenStyleFields value={tokenDraft} roomId={roomId} onChange={setTokenDraft} liveName />
        </div>
      )}

      {tool === "calibrate" && (
        <div className="toolbar toolbar-style toolbar-hint" role="status">
          Trascina un riquadro sul bordo di una casella della mappa. Esc per annullare.
        </div>
      )}

      {role === "gm" && gridPanelOpen && (
        <GridPanel store={store} onClose={() => setGridPanelOpen(false)} />
      )}

      {DRAWING_TOOLS.includes(tool) && (
        <div className="toolbar toolbar-style" role="toolbar" aria-label="Stile">
          {DRAW_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="color-button"
              style={{ background: c }}
              aria-pressed={color === c}
              aria-label={COLOR_NAMES[c] ?? c}
              title={COLOR_NAMES[c] ?? c}
              onClick={() => setColor(c)}
            />
          ))}
          {tool !== "text" && (
            <>
              <span className="toolbar-separator" />
              {STROKE_WIDTHS.map((w) => (
                <button
                  key={w}
                  type="button"
                  className="icon-button"
                  aria-pressed={strokeWidth === w}
                  aria-label={`Spessore ${w}`}
                  title={`Spessore ${w}`}
                  onClick={() => setStrokeWidth(w)}
                >
                  <span className="width-dot" style={{ width: w + 2, height: w + 2 }} />
                </button>
              ))}
            </>
          )}
          {(tool === "rect" || tool === "ellipse") && (
            <>
              <span className="toolbar-separator" />
              <button
                type="button"
                className="icon-button"
                aria-pressed={filled}
                title="Riempimento"
                aria-label="Riempimento"
                onClick={() => setFilled(!filled)}
              >
                <span
                  className={filled ? "fill-swatch filled" : "fill-swatch"}
                  style={{ borderColor: color, background: filled ? color : "transparent" }}
                />
              </button>
            </>
          )}
        </div>
      )}

      <div className="toolbar toolbar-zoom" role="toolbar" aria-label="Zoom">
        <button
          type="button"
          className="icon-button"
          aria-label="Riduci"
          title="Riduci"
          onClick={() => setViewport(zoomAt(viewport, center, 1 / 1.25))}
        >
          −
        </button>
        <button
          type="button"
          className="zoom-level"
          title="Zoom al 100% (Shift+0)"
          aria-label="Zoom al 100%"
          onClick={() => setViewport(zoomAt(viewport, center, clampScale(1) / viewport.scale))}
        >
          {Math.round(viewport.scale * 100)}%
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Ingrandisci"
          title="Ingrandisci"
          onClick={() => setViewport(zoomAt(viewport, center, 1.25))}
        >
          +
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Adatta al contenuto"
          title="Adatta al contenuto (Shift+1)"
          onClick={onFit}
        >
          {FitIcon}
        </button>
      </div>
    </>
  );
}
