import type { HocuspocusProvider } from "@hocuspocus/provider";
import {
  DRAW_COLORS,
  type Role,
  STROKE_WIDTHS,
  TEMPLATE_SHAPES,
  type TemplateShape,
} from "@scryboard/shared";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import { storage, subscribeGeminiKey } from "../lib/storage";
import { COLOR_NAMES } from "./colors";
import { FogPanel } from "./FogPanel";
import { GridPanel } from "./GridPanel";
import {
  EyeIcon,
  EyeOffIcon,
  FitIcon,
  GridIcon,
  ImageIcon,
  MapGenerateIcon,
  RedoIcon,
  SummonIcon,
  TOOL_ICONS,
  TrashIcon,
  TurnsIcon,
  UndoIcon,
} from "./icons";
import { LightPanel } from "./LightPanel";
import { MapGenerator } from "./MapGenerator";
import { PathPanel } from "./PathPanel";
import { StampPanel } from "./StampPanel";
import type { BoardStore } from "./store";
import { TerrainPanel } from "./TerrainPanel";
import { TokenStyleFields } from "./TokenStyleFields";
import { type Tool, useBoardUi } from "./tools";
import { clampScale, screenToWorld, zoomAt } from "./viewport";
import { WallPanel } from "./WallPanel";

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
const GM_ONLY: { tool: Tool; label: string; key: string }[] = [
  { tool: "terrain", label: "Terreno", key: "B" },
  { tool: "path", label: "Percorso", key: "J" },
  { tool: "light", label: "Luce", key: "I" },
  { tool: "stamp", label: "Timbri", key: "S" },
  { tool: "wall", label: "Muri", key: "W" },
  { tool: "fog", label: "Nebbia", key: "F" },
];

const RULER_MODES: { id: "ruler" | TemplateShape; label: string }[] = [
  { id: "ruler", label: "Distanza" },
  ...TEMPLATE_SHAPES,
];

const DRAWING_TOOLS: Tool[] = ["pen", "line", "rect", "ellipse", "text"];

interface Props {
  store: BoardStore;
  provider: HocuspocusProvider;
  role: Role;
  roomId: string;
  onUpload: (files: File[]) => void;
  onFit: () => void;
  viewportSize: { width: number; height: number };
}

export function Toolbar({ store, provider, role, roomId, onUpload, onFit, viewportSize }: Props) {
  const {
    tool,
    color,
    strokeWidth,
    filled,
    viewport,
    tokenDraft,
    gridPanelOpen,
    createHidden,
    rulerShape,
    initiativeOpen,
  } = useBoardUi();
  const {
    setTool,
    setColor,
    setStrokeWidth,
    setFilled,
    setViewport,
    setTokenDraft,
    setGridPanelOpen,
    setCreateHidden,
    setRulerShape,
    setInitiativeOpen,
    select,
    setEditingText,
  } = useBoardUi.getState();
  const grid = useSyncExternalStore(store.subscribe, store.getGrid);
  const attachFrom = useBoardUi((s) => s.attachFrom);
  const canUndo = useSyncExternalStore(store.subscribe, () => store.canUndo());
  const canRedo = useSyncExternalStore(store.subscribe, () => store.canRedo());
  const isEmpty = useSyncExternalStore(store.subscribe, () => store.isEmpty());
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [mapModalOpen, setMapModalOpen] = useState(false);
  // Generare mappe richiede una chiave di Gemini; senza, il pulsante non compare.
  const geminiKey = useSyncExternalStore(subscribeGeminiKey, storage.getGeminiKey);
  const clearTitleId = useId();
  const clearDescId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const center = { x: viewportSize.width / 2, y: viewportSize.height / 2 };

  return (
    <>
      <div className="toolbar toolbar-tools" role="toolbar" aria-label="Strumenti">
        {[...TOOLS, ...(role === "gm" ? GM_ONLY : [])].map((t) => (
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
        {role === "gm" && geminiKey && (
          <button
            type="button"
            className="icon-button"
            title="Genera una mappa con Gemini"
            aria-label="Genera mappa"
            onClick={() => setMapModalOpen(true)}
          >
            {MapGenerateIcon}
          </button>
        )}
        {role === "gm" && (
          <button
            type="button"
            className="icon-button"
            aria-pressed={createHidden}
            aria-label="Crea nascosti"
            title={
              createHidden
                ? "I nuovi oggetti sono nascosti ai giocatori (clic per crearli visibili)"
                : "I nuovi oggetti sono visibili (clic per crearli nascosti)"
            }
            onClick={() => setCreateHidden(!createHidden)}
          >
            {createHidden ? EyeOffIcon : EyeIcon}
          </button>
        )}
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
        {role === "gm" && (
          <>
            <span className="toolbar-separator" />
            <button
              type="button"
              className="icon-button"
              title="Svuota lavagna"
              aria-label="Svuota lavagna"
              disabled={isEmpty}
              onClick={() => setClearModalOpen(true)}
            >
              {TrashIcon}
            </button>
          </>
        )}
      </div>

      {role === "gm" && geminiKey && mapModalOpen && (
        <MapGenerator
          apiKey={geminiKey}
          onPick={(file) => onUpload([file])}
          onClose={() => setMapModalOpen(false)}
        />
      )}

      {role === "gm" && clearModalOpen && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: Esc chiude nativamente <dialog>.
        <dialog
          ref={(el) => {
            if (el && !el.open) el.showModal();
          }}
          className="card stack modal"
          aria-labelledby={clearTitleId}
          aria-describedby={clearDescId}
          onClose={() => setClearModalOpen(false)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setClearModalOpen(false);
          }}
        >
          <h2 id={clearTitleId}>Svuotare la lavagna?</h2>
          <p id={clearDescId} className="muted small">
            Verranno rimossi mappe, terreno, percorsi, muri, porte, luci, token, nebbia e disegni.
            Potrai comunque annullare con Ctrl+Z.
          </p>
          <div className="modal-actions">
            <button type="button" onClick={() => setClearModalOpen(false)}>
              Annulla
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                store.clearBoard();
                select([]);
                setEditingText(null);
                setClearModalOpen(false);
              }}
            >
              Svuota lavagna
            </button>
          </div>
        </dialog>
      )}

      {tool === "token" && (
        <div className="toolbar toolbar-style" role="toolbar" aria-label="Nuovo token">
          <TokenStyleFields value={tokenDraft} roomId={roomId} onChange={setTokenDraft} liveName />
        </div>
      )}

      {tool === "fog" && role === "gm" && <FogPanel store={store} />}
      {tool === "terrain" && role === "gm" && <TerrainPanel store={store} />}
      {tool === "path" && role === "gm" && <PathPanel />}
      {tool === "stamp" && role === "gm" && <StampPanel />}
      {tool === "light" && role === "gm" && <LightPanel store={store} provider={provider} />}
      {tool === "wall" && role === "gm" && <WallPanel store={store} roomId={roomId} />}

      {tool === "ruler" && (
        <div className="toolbar toolbar-style" role="toolbar" aria-label="Righello">
          {RULER_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={rulerShape === m.id}
              onClick={() => setRulerShape(m.id)}
            >
              {m.label}
            </button>
          ))}
          <span className="toolbar-separator" />
          <span className="small muted">
            {rulerShape === "ruler"
              ? "Spazio aggiunge una tappa."
              : "Maiusc al rilascio fissa la sagoma. Alt: senza griglia."}
          </span>
        </div>
      )}

      {attachFrom && (
        <div className="toolbar toolbar-style toolbar-hint attach-hint" role="status">
          Clicca il token principale a cui agganciare «
          {store.get(attachFrom)?.kind === "token"
            ? (store.get(attachFrom) as { name: string }).name || "il token"
            : "il token"}
          ». Esc per annullare.
        </div>
      )}

      {tool === "calibrate" && (
        <div className="toolbar toolbar-style toolbar-hint" role="status">
          {grid.type === "square"
            ? "Trascina un riquadro sul bordo di una casella della mappa."
            : "Trascina un riquadro attorno a un esagono della mappa."}{" "}
          Esc per annullare.
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
        {/* Il righello sta qui: la colonna degli strumenti è già alta quanto la finestra. */}
        <button
          type="button"
          className="icon-button"
          aria-pressed={tool === "ruler"}
          aria-label="Righello"
          title="Righello (M)"
          onClick={() => setTool("ruler")}
        >
          {TOOL_ICONS.ruler}
        </button>
        {role === "gm" && (
          <button
            type="button"
            className="icon-button"
            aria-label="Porta qui i giocatori"
            title="Porta qui i giocatori: centrano la loro vista su questo punto (Maiusc + pressione prolungata sul punto che vuoi)"
            onClick={() => store.summon(screenToWorld(viewport, center), viewport.scale)}
          >
            {SummonIcon}
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          aria-pressed={initiativeOpen}
          aria-label="Turni"
          title="Ordine dei turni"
          onClick={() => setInitiativeOpen(!initiativeOpen)}
        >
          {TurnsIcon}
        </button>
        <span className="toolbar-separator" />
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
