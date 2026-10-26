import type { HocuspocusProvider } from "@hocuspocus/provider";
import {
  DRAW_COLORS,
  type Role,
  STROKE_WIDTHS,
  TEMPLATE_SHAPES,
  type TemplateShape,
} from "@scryboard/shared";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { catalogLabel, colorLabel } from "../i18n/catalog";
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

const TOOLS: { tool: Tool; key: string }[] = [
  { tool: "select", key: "V" },
  { tool: "hand", key: "H" },
  { tool: "pen", key: "P" },
  { tool: "line", key: "L" },
  { tool: "rect", key: "R" },
  { tool: "ellipse", key: "O" },
  { tool: "text", key: "T" },
  { tool: "eraser", key: "E" },
  { tool: "token", key: "K" },
];
const GM_ONLY: { tool: Tool; key: string }[] = [
  { tool: "terrain", key: "B" },
  { tool: "path", key: "J" },
  { tool: "light", key: "I" },
  { tool: "stamp", key: "S" },
  { tool: "wall", key: "W" },
  { tool: "fog", key: "F" },
];

const RULER_MODES: ("ruler" | TemplateShape)[] = [
  "ruler",
  ...TEMPLATE_SHAPES.map((shape) => shape.id),
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
  const { t } = useTranslation();
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
  const rulerModeLabel = (mode: "ruler" | TemplateShape) => {
    if (mode === "ruler") return t("tools.toolbar.ruler.distance");
    const shape = TEMPLATE_SHAPES.find((shape) => shape.id === mode);
    return catalogLabel(t, "templates", mode, shape?.label ?? mode);
  };

  return (
    <>
      <div className="toolbar toolbar-tools" role="toolbar" aria-label={t("tools.toolbar.label")}>
        {[...TOOLS, ...(role === "gm" ? GM_ONLY : [])].map((item) => {
          const label = t(`tools.toolbar.tools.${item.tool}`);
          return (
            <button
              key={item.tool}
              type="button"
              className="icon-button"
              aria-pressed={tool === item.tool}
              title={t("tools.toolbar.toolTitle", { label, key: item.key })}
              aria-label={label}
              onClick={() => setTool(item.tool)}
            >
              {TOOL_ICONS[item.tool]}
            </button>
          );
        })}
        <span className="toolbar-separator" />
        <button
          type="button"
          className="icon-button"
          title={
            role === "gm" ? t("tools.toolbar.upload.titleGm") : t("tools.toolbar.upload.title")
          }
          aria-label={t("tools.toolbar.upload.label")}
          onClick={() => fileInput.current?.click()}
        >
          {ImageIcon}
        </button>
        {role === "gm" && geminiKey && (
          <button
            type="button"
            className="icon-button"
            title={t("tools.toolbar.generateMap.title")}
            aria-label={t("tools.toolbar.generateMap.label")}
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
            aria-label={t("tools.toolbar.createHidden.label")}
            title={
              createHidden
                ? t("tools.toolbar.createHidden.hiddenTitle")
                : t("tools.toolbar.createHidden.visibleTitle")
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
            title={t("tools.toolbar.grid")}
            aria-label={t("tools.toolbar.grid")}
            aria-pressed={gridPanelOpen}
            onClick={() => setGridPanelOpen(!gridPanelOpen)}
          >
            {GridIcon}
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept={
            role === "gm"
              ? "image/png,image/jpeg,image/webp,image/gif,video/webm,video/mp4,.uvtt,.dd2vtt,.df2vtt"
              : "image/png,image/jpeg,image/webp,image/gif"
          }
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
          title={t("tools.toolbar.undo.title")}
          aria-label={t("tools.toolbar.undo.label")}
          disabled={!canUndo}
          onClick={() => store.undo()}
        >
          {UndoIcon}
        </button>
        <button
          type="button"
          className="icon-button"
          title={t("tools.toolbar.redo.title")}
          aria-label={t("tools.toolbar.redo.label")}
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
              title={t("tools.toolbar.clear.label")}
              aria-label={t("tools.toolbar.clear.label")}
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
          <h2 id={clearTitleId}>{t("tools.toolbar.clear.title")}</h2>
          <p id={clearDescId} className="muted small">
            {t("tools.toolbar.clear.description")}
          </p>
          <div className="modal-actions">
            <button type="button" onClick={() => setClearModalOpen(false)}>
              {t("tools.toolbar.clear.cancel")}
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
              {t("tools.toolbar.clear.confirm")}
            </button>
          </div>
        </dialog>
      )}

      {tool === "token" && (
        <div
          className="toolbar toolbar-style"
          role="toolbar"
          aria-label={t("tools.toolbar.newToken")}
        >
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
        <div
          className="toolbar toolbar-style"
          role="toolbar"
          aria-label={t("tools.toolbar.ruler.label")}
        >
          {RULER_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={rulerShape === mode}
              onClick={() => setRulerShape(mode)}
            >
              {rulerModeLabel(mode)}
            </button>
          ))}
          <span className="toolbar-separator" />
          <span className="small muted">
            {rulerShape === "ruler"
              ? t("tools.toolbar.ruler.distanceHint")
              : t("tools.toolbar.ruler.templateHint")}
          </span>
        </div>
      )}

      {attachFrom && (
        <div className="toolbar toolbar-style toolbar-hint attach-hint" role="status">
          {t("tools.toolbar.attach.hint", {
            name:
              store.get(attachFrom)?.kind === "token"
                ? (store.get(attachFrom) as { name: string }).name ||
                  t("tools.toolbar.attach.tokenFallback")
                : t("tools.toolbar.attach.tokenFallback"),
          })}
        </div>
      )}

      {tool === "calibrate" && (
        <div className="toolbar toolbar-style toolbar-hint" role="status">
          {grid.type === "square"
            ? t("tools.toolbar.calibrate.square")
            : t("tools.toolbar.calibrate.hex")}
        </div>
      )}

      {role === "gm" && gridPanelOpen && (
        <GridPanel store={store} onClose={() => setGridPanelOpen(false)} />
      )}

      {DRAWING_TOOLS.includes(tool) && (
        <div
          className="toolbar toolbar-style"
          role="toolbar"
          aria-label={t("tools.toolbar.style.label")}
        >
          {DRAW_COLORS.map((c) => {
            const label = colorLabel(t, c, COLOR_NAMES[c] ?? c);
            return (
              <button
                key={c}
                type="button"
                className="color-button"
                style={{ background: c }}
                aria-pressed={color === c}
                aria-label={label}
                title={label}
                onClick={() => setColor(c)}
              />
            );
          })}
          {tool !== "text" && (
            <>
              <span className="toolbar-separator" />
              {STROKE_WIDTHS.map((w) => (
                <button
                  key={w}
                  type="button"
                  className="icon-button"
                  aria-pressed={strokeWidth === w}
                  aria-label={t("tools.toolbar.style.strokeWidth", { width: w })}
                  title={t("tools.toolbar.style.strokeWidth", { width: w })}
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
                title={t("tools.toolbar.style.fill")}
                aria-label={t("tools.toolbar.style.fill")}
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

      <div
        className="toolbar toolbar-zoom"
        role="toolbar"
        aria-label={t("tools.toolbar.zoom.label")}
      >
        {/* Il righello sta qui: la colonna degli strumenti è già alta quanto la finestra. */}
        <button
          type="button"
          className="icon-button"
          aria-pressed={tool === "ruler"}
          aria-label={t("tools.toolbar.ruler.label")}
          title={t("tools.toolbar.ruler.title")}
          onClick={() => setTool("ruler")}
        >
          {TOOL_ICONS.ruler}
        </button>
        {role === "gm" && (
          <button
            type="button"
            className="icon-button"
            aria-label={t("tools.toolbar.zoom.summon.label")}
            title={t("tools.toolbar.zoom.summon.title")}
            onClick={() => store.summon(screenToWorld(viewport, center), viewport.scale)}
          >
            {SummonIcon}
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          aria-pressed={initiativeOpen}
          aria-label={t("tools.toolbar.zoom.turns.label")}
          title={t("tools.toolbar.zoom.turns.title")}
          onClick={() => setInitiativeOpen(!initiativeOpen)}
        >
          {TurnsIcon}
        </button>
        <span className="toolbar-separator" />
        <button
          type="button"
          className="icon-button"
          aria-label={t("tools.toolbar.zoom.out")}
          title={t("tools.toolbar.zoom.out")}
          onClick={() => setViewport(zoomAt(viewport, center, 1 / 1.25))}
        >
          −
        </button>
        <button
          type="button"
          className="zoom-level"
          title={t("tools.toolbar.zoom.reset.title")}
          aria-label={t("tools.toolbar.zoom.reset.label")}
          onClick={() => setViewport(zoomAt(viewport, center, clampScale(1) / viewport.scale))}
        >
          {Math.round(viewport.scale * 100)}%
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={t("tools.toolbar.zoom.in")}
          title={t("tools.toolbar.zoom.in")}
          onClick={() => setViewport(zoomAt(viewport, center, 1.25))}
        >
          +
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={t("tools.toolbar.zoom.fit.label")}
          title={t("tools.toolbar.zoom.fit.title")}
          onClick={onFit}
        >
          {FitIcon}
        </button>
      </div>
    </>
  );
}
