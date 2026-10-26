import type { HocuspocusProvider } from "@hocuspocus/provider";
import type {
  BoardItem,
  Door,
  FogOp,
  Role,
  ShapeItem,
  StrokeItem,
  TemplateShape,
  TerrainOp,
  TextItem,
  TokenItem,
  Wall,
} from "@scryboard/shared";
import {
  canModify,
  canPlayerToggleDoor,
  canSelect,
  isDoorFogged,
  LIGHT_PRESETS,
  STAMPS,
  type StampId,
} from "@scryboard/shared";
import type Konva from "konva";
import {
  type DragEvent as ReactDragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import { Circle, Group, Layer, Line, Rect, Stage, Transformer } from "react-konva";
import { RollToasts } from "../dice/RollToasts";
import {
  insertPoint,
  nearestSegment,
  type PathPoint,
  toFlat,
  toPathPoints,
} from "../paths/geometry";
import { PathHandles } from "../paths/PathHandles";
import { PathShape } from "../paths/PathShape";
import { usePathDrawing } from "../paths/usePathDrawing";
import { terrainFillArea } from "../terrain/fill";
import { simplify, terrainOpBounds } from "../terrain/geometry";
import { biomeColor } from "../terrain/textures";
import { ExploredMap } from "../vision/explored";
import { drawVisibleArea } from "../vision/render";
import { isDoorSeen } from "../vision/sources";
import { useVision } from "../vision/useVision";
import { VisionLayer } from "../vision/VisionLayer";
import { movementFraction, wallSegments } from "../walls/geometry";
import { useWallDrawing } from "../walls/useWallDrawing";
import { WallHandles } from "../walls/WallHandles";
import { WallLayer } from "../walls/WallLayer";
import { type TemplateGeometry, templateFromDrag, templateLabel } from "./areas";
import { useAssetAuth } from "./assetAuth";
import { attachError, followers, parentOf } from "./attach";
import { FogLayer, FogShape } from "./FogLayer";
import { GridLines } from "./GridLines";
import { bakeScale, boxesIntersect, itemBounds, normalizeBox, unionBounds } from "./geometry";
import { calibrateFromBox, nextTokenName, snapGridCorner, snapTokenCenter } from "./grid";
import { InitiativePanel } from "./InitiativePanel";
import { ItemNode, SELECTION_COLOR, StampContent } from "./ItemNode";
import {
  formatDistance,
  formatElevation,
  measureRise,
  pathCells,
  snapRulerPoint,
  withRise,
} from "./measure";
import { PingArrows } from "./PingArrows";
import { type DraftStroke, Presence, useAwarenessBroadcast } from "./Presence";
import { flattenPoints, RulerShape, type RulerState } from "./Ruler";
import { SelectionPanel } from "./SelectionPanel";
import { ShapePreview } from "./ShapePreview";
import { type BoardStore, type ItemPatch, newItemId } from "./store";
import { AreaHighlights, AreaPreview, tokensInside } from "./Templates";
import { TerrainLayer } from "./TerrainLayer";
import { TextEditor } from "./TextEditor";
import { TokenList } from "./TokenList";
import { Toolbar } from "./Toolbar";
import { useBoardUi } from "./tools";
import {
  isSupportedImage,
  isSupportedVideo,
  UploadError,
  uploadImage,
  uploadVideo,
} from "./upload";
import { useBoardShortcuts } from "./useBoardShortcuts";
import { centerOn, fitBounds, type Point, screenToWorld, type Viewport, zoomAt } from "./viewport";
import { WallSelectionPanel } from "./WallPanel";

interface Props {
  store: BoardStore;
  provider: HocuspocusProvider;
  roomId: string;
  /** Scena aperta: la memoria delle zone esplorate è separata per scena. */
  sceneId?: string;
  role: Role;
}

type Interaction =
  | { type: "pan"; start: Point; viewport: Viewport }
  | { type: "stroke"; origin: Point; points: number[] }
  | { type: "shape"; shape: ShapeItem["shape"]; start: Point; end: Point }
  | { type: "erase" }
  | { type: "calibrate"; start: Point; end: Point }
  /** Righello: tappe fisse e punto sotto il cursore. */
  | { type: "ruler"; points: Point[]; cursor: Point }
  /** Sagoma d'area (cerchio, cono, cubo, raggio) tracciata dall'origine al cursore. */
  | { type: "template"; shape: TemplateShape; start: Point; end: Point; free: boolean }
  | { type: "fogRect"; start: Point; end: Point }
  | { type: "fogBrush"; points: number[] }
  | { type: "marquee"; start: Point; end: Point; additive: boolean }
  | { type: "terrainBrush"; points: number[]; erase: boolean }
  | { type: "stampScatter"; stamps: StampDraft[]; last: Point }
  | { type: "terrainCopy"; start: Point; end: Point };

/** Timbro in anteprima mentre lo si sparge, prima di salvarlo. */
interface StampDraft {
  x: number;
  y: number;
  stamp: StampId;
  size: number;
  rotation: number;
  variant: number;
}

/** Ingrandimento massimo di "Adatta al contenuto": oltre si perde il contesto attorno. */
const FIT_VIEW_MAX_SCALE = 2;

/** Tempo di pressione, senza muoversi, che lancia un ping. */
const PING_HOLD_MS = 550;

/** Durata dello spostamento della vista quando il GM richiama i giocatori. */
const SUMMON_MS = 450;

/** Tempo in cui una sagoma non fissata resta visibile dopo il rilascio. */
const TEMPLATE_LINGER_MS = 4000;

interface Notice {
  text: string;
  kind?: "loading";
  action?: { label: string; run: () => void };
}

const DEFAULT_FONT_SIZE = 24;

/** Riquadro del terreno dipinto, per adattare la vista al contenuto. */
function terrainBounds(ops: TerrainOp[]) {
  const paints = ops.filter((op) => op.mode === "paint").map(terrainOpBounds);
  if (paints.length === 0) return null;
  const x = Math.min(...paints.map((b) => b.x));
  const y = Math.min(...paints.map((b) => b.y));
  const right = Math.max(...paints.map((b) => b.x + b.width));
  const bottom = Math.max(...paints.map((b) => b.y + b.height));
  return { x, y, width: right - x, height: bottom - y };
}

/** Riquadro occupato da tutti i muri, per adattare la vista al contenuto. */
function wallsBounds(walls: Wall[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const wall of walls) {
    for (let i = 0; i + 1 < wall.points.length; i += 2) {
      const x = wall.points[i] as number;
      const y = wall.points[i + 1] as number;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return walls.length === 0 ? null : { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Risale dal nodo colpito al gruppo che rappresenta un oggetto della board. */
function findItemId(node: Konva.Node | null): string | null {
  let current: Konva.Node | null = node;
  while (current) {
    if (current.hasName("item")) return current.id();
    current = current.getParent();
  }
  return null;
}

/** Ancore, rotazione e bordo del Transformer: le gestisce Konva, non sono spazio vuoto. */
function isTransformerPart(node: Konva.Node | null): boolean {
  return node?.getParent()?.className === "Transformer";
}

/** Risale dal nodo colpito al gruppo di un muro (visibile e selezionabile solo dal GM). */
function findWallId(node: Konva.Node | null): string | null {
  let current: Konva.Node | null = node;
  while (current) {
    if (current.hasName("wall")) return current.id();
    current = current.getParent();
  }
  return null;
}

export function Board({ store, provider, roomId, sceneId = "main", role }: Props) {
  const { t } = useTranslation();
  const items = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const grid = useSyncExternalStore(store.subscribe, store.getGrid);
  const fog = useSyncExternalStore(store.subscribe, store.getFog);
  const terrain = useSyncExternalStore(store.subscribe, store.getTerrain);
  const walls = useSyncExternalStore(store.subscribe, store.getWalls);
  const lighting = useSyncExternalStore(store.subscribe, store.getLighting);
  const collisionSegments = useMemo(() => wallSegments(walls), [walls]);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);

  /** Ultimo token piazzato con lo strumento Token: segue le immagini scelte subito dopo. */
  const lastTokenRef = useRef<string | null>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const [notice, setNoticeState] = useState<Notice | null>(null);
  const setNotice = useCallback(
    (text: string | null, action?: Notice["action"], kind?: Notice["kind"]) =>
      setNoticeState(text ? { text, action, kind } : null),
    [],
  );
  /** Poligono di nebbia in costruzione: vertici già fissati e posizione del puntatore. */
  const [polygon, setPolygon] = useState<{
    points: number[];
    cursor: Point;
    purpose: "fog" | "terrain";
  } | null>(null);
  const [draftText, setDraftText] = useState<TextItem | null>(null);
  const fittedRef = useRef(false);

  const tool = useBoardUi((s) => s.tool);
  const color = useBoardUi((s) => s.color);
  const strokeWidth = useBoardUi((s) => s.strokeWidth);
  const filled = useBoardUi((s) => s.filled);
  const selectedIds = useBoardUi((s) => s.selectedIds);
  const editingTextId = useBoardUi((s) => s.editingTextId);
  const viewport = useBoardUi((s) => s.viewport);
  const spacePan = useBoardUi((s) => s.spacePan);
  const initiativeOpen = useBoardUi((s) => s.initiativeOpen);
  const attachFrom = useBoardUi((s) => s.attachFrom);
  const turn = useSyncExternalStore(store.subscribe, store.getTurn);
  const fogMode = useBoardUi((s) => s.fogMode);
  const fogShape = useBoardUi((s) => s.fogShape);
  const fogBrush = useBoardUi((s) => s.fogBrush);
  const createHidden = useBoardUi((s) => s.createHidden);
  const draftAssetId = useBoardUi((s) => s.tokenDraft.assetId);
  const draftPortrait = useBoardUi((s) => s.tokenDraft.portrait ?? null);
  const terrainBiome = useBoardUi((s) => s.terrainBiome);
  const terrainMode = useBoardUi((s) => s.terrainMode);
  const terrainSize = useBoardUi((s) => s.terrainSize);
  const terrainExact = useBoardUi((s) => s.terrainExact);
  const terrainClipboard = useBoardUi((s) => s.terrainClipboard);
  /** Posizione del puntatore per l'anteprima dell'incolla. */
  const [pasteCursor, setPasteCursor] = useState<Point | null>(null);
  /** Larghezza del pennello del terreno in pixel del mondo: segue la casella della griglia. */
  const terrainWidth = terrainSize * grid.size;
  const pathStyle = useBoardUi((s) => s.pathStyle);
  const pathPoint = useBoardUi((s) => s.pathPoint);
  const wallKind = useBoardUi((s) => s.wallKind);
  const selectedWallId = useBoardUi((s) => s.selectedWallId);
  /** Punti di un muro mentre se ne trascina una maniglia (non ancora salvati). */
  const [wallEdit, setWallEdit] = useState<{ id: string; points: number[] } | null>(null);
  const snapWallPoint = (point: Point) => (grid.enabled ? snapGridCorner(point, grid) : point);
  const wallDrawing = useWallDrawing({
    active: tool === "wall" && role === "gm",
    kind: wallKind,
    snap: snapWallPoint,
    onCreate: (points) => {
      store.addWall(
        wallKind === "door" ? { kind: "door", points, door: "closed" } : { kind: wallKind, points },
      );
    },
  });
  /** Punti di un percorso mentre se ne trascina una maniglia (non ancora salvati). */
  const [pathEdit, setPathEdit] = useState<{ id: string; points: number[] } | null>(null);
  const pathDrawing = usePathDrawing({
    active: tool === "path" && role === "gm",
    cellSize: grid.size,
    onCreate: (points) => {
      const origin = points[0] as PathPoint;
      // I punti si salvano relativi al primo, così il percorso si sposta come gli altri oggetti.
      const relative = points.map((pt) => ({ x: pt.x - origin.x, y: pt.y - origin.y, w: pt.w }));
      addItems([
        { ...base("paths", origin), kind: "path", style: pathStyle, points: toFlat(relative) },
      ]);
    },
  });
  const { select, selectWall, setViewport, setEditingText, setTool, setGridPanelOpen } =
    useBoardUi.getState();

  const canEdit = useCallback((item: BoardItem | undefined) => canModify(item, role), [role]);
  const panMode = tool === "hand" || spacePan;
  const broadcastCursor = useAwarenessBroadcast<Point>(provider, "cursor");
  const broadcastDraft = useAwarenessBroadcast<DraftStroke>(provider, "draft");
  const broadcastRuler = useAwarenessBroadcast<RulerState>(provider, "ruler");
  const broadcastTemplate = useAwarenessBroadcast<TemplateGeometry>(provider, "template");
  /** Sagoma appena rilasciata: resta in vista qualche secondo, a meno che la si fissi con Maiusc. */
  const [lingering, setLingering] = useState<TemplateGeometry | null>(null);
  const lingerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearLinger = () => {
    if (lingerTimer.current) clearTimeout(lingerTimer.current);
    lingerTimer.current = null;
    setLingering(null);
    broadcastTemplate(null);
  };
  useEffect(
    () => () => {
      if (lingerTimer.current) clearTimeout(lingerTimer.current);
    },
    [],
  );
  /** Distanza di un token trascinato: tappe fisse e posizione attuale. */
  const [dragMeasure, setDragMeasureState] = useState<{ points: Point[]; cursor: Point } | null>(
    null,
  );
  const dragMeasureRef = useRef<{ id: string; shared: boolean; points: Point[]; cursor: Point }>(
    null,
  );
  const pressRef = useRef<{ timer: ReturnType<typeof setTimeout>; screen: Point } | null>(null);
  /** Ultime posizioni sicure degli oggetti durante il trascinamento (inizialmente quelle di partenza). */
  const dragLastRef = useRef<Map<string, Point> | null>(null);
  const dragStartRef = useRef<Map<string, Point> | null>(null);
  const [draggedWallOffsets, setDraggedWallOffsets] = useState<Map<string, Point>>(() => new Map());
  const myColor =
    (provider.awareness?.getLocalState()?.user as { color?: string } | undefined)?.color ??
    "#e5484d";

  /** Aggiorna la misura del token trascinato; gli altri la vedono salvo che il token sia nascosto. */
  function setDragMeasure(
    next: { id: string; shared: boolean; points: Point[]; cursor: Point } | null,
  ) {
    dragMeasureRef.current = next;
    setDragMeasureState(next && { points: next.points, cursor: next.cursor });
    const moved =
      next &&
      Math.hypot(
        next.cursor.x - (next.points.at(-1) as Point).x,
        next.cursor.y - (next.points.at(-1) as Point).y,
      ) > 1;
    broadcastRuler(
      next?.shared && moved ? { points: flattenPoints([...next.points, next.cursor]) } : null,
    );
  }

  const measurePoints =
    interaction?.type === "ruler"
      ? [...interaction.points, interaction.cursor]
      : dragMeasure && [...dragMeasure.points, dragMeasure.cursor];

  // Spazio aggiunge una tappa alla misura in corso, Esc annulla il righello.
  const measuring =
    interaction?.type === "ruler" || interaction?.type === "template" || dragMeasure !== null;
  useEffect(() => {
    useBoardUi.getState().setMeasuring(measuring);
    return () => useBoardUi.getState().setMeasuring(false);
  }, [measuring]);
  useEffect(() => {
    if (!measuring) return;
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space") {
        const drag = dragMeasureRef.current;
        if (drag) {
          setDragMeasure({ ...drag, points: [...drag.points, drag.cursor] });
        } else {
          setInteraction((current) =>
            current?.type === "ruler"
              ? { ...current, points: [...current.points, current.cursor] }
              : current,
          );
        }
      } else if (e.key === "Escape" && !dragMeasureRef.current) {
        setInteraction(null);
        broadcastRuler(null);
        broadcastTemplate(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const gmToken = useAssetAuth();

  // Visione: il giocatore guarda dai suoi token; il GM vede tutto o, in anteprima, come un giocatore.
  const visionPreview = useBoardUi((s) => s.visionPreview);
  const viewerId = role === "player" ? store.userId : visionPreview;
  // L'anteprima del GM ignora ciò che i giocatori non ricevono (oggetti nascosti).
  const viewerItems = useMemo(
    () => (role === "gm" && visionPreview ? items.filter((i) => !store.isHidden(i.id)) : items),
    [items, role, visionPreview, store],
  );
  const vision = useVision({ items: viewerItems, walls, grid, lighting, viewerId });
  const visibleTokens = items.filter(
    (i): i is TokenItem => i.kind === "token" && (!vision.active || vision.isVisible(i)),
  );
  const areaShown =
    interaction?.type === "template"
      ? templateFromDrag(
          interaction.shape,
          interaction.start,
          interaction.end,
          grid,
          interaction.free,
        )
      : lingering;
  // Il righello tiene conto della quota dei token agli estremi; il trascinamento no (stessa quota).
  const rulerRise =
    interaction?.type === "ruler" && measurePoints
      ? measureRise(measurePoints, visibleTokens, grid)
      : 0;
  const measureText = measurePoints
    ? formatDistance(withRise(pathCells(measurePoints, grid), rulerRise, grid), grid)
    : areaShown
      ? t("core.templates.summary", {
          label: templateLabel(areaShown, grid),
          count: tokensInside(areaShown, visibleTokens, grid.size).length,
        })
      : "";
  const [exploredVersion, setExploredVersion] = useState(0);
  const explored = useMemo(
    () =>
      role === "player" && lighting.enabled
        ? new ExploredMap(
            // La scena originale tiene la chiave di prima, così non si perde la memoria già raccolta.
            `scryboard:explored:${roomId}${sceneId === "main" ? "" : `:${sceneId}`}:${store.userId}:${lighting.explorationEpoch}`,
            () => setExploredVersion((v) => v + 1),
          )
        : null,
    [role, lighting.enabled, lighting.explorationEpoch, roomId, sceneId, store.userId],
  );
  useEffect(() => {
    explored?.load();
    return () => explored?.dispose();
  }, [explored]);

  /** Riquadro di tutto il contenuto (oggetti, terreno, muri visibili a chi guarda). */
  const contentBounds = useCallback(() => {
    const itemBox = unionBounds(store.getSnapshot(), store.getGrid().size);
    const terrainBox = terrainBounds(store.getTerrain());
    // I giocatori adattano la vista soltanto alle porte, uniche barriere visibili nel loro client.
    const wallBox = wallsBounds(
      role === "gm"
        ? store.getWalls()
        : store.getWalls().filter((wall) => wall.kind === "door" && !wall.secret),
    );
    const boxes = [itemBox, terrainBox, wallBox].filter(
      (b): b is NonNullable<typeof b> => b !== null,
    );
    const bounds =
      boxes.length === 0
        ? null
        : (() => {
            const x = Math.min(...boxes.map((b) => b.x));
            const y = Math.min(...boxes.map((b) => b.y));
            const right = Math.max(...boxes.map((b) => b.x + b.width));
            const bottom = Math.max(...boxes.map((b) => b.y + b.height));
            return { x, y, width: right - x, height: bottom - y };
          })();
    return bounds;
  }, [store, role]);

  const fitToContent = useCallback(() => {
    const bounds = contentBounds();
    if (bounds && size.width > 0) setViewport(fitBounds(bounds, size));
  }, [contentBounds, size, setViewport]);

  /**
   * "Adatta al contenuto" chiesto dall'utente (pulsante o Shift+1): ingrandisce anche i contenuti
   * piccoli e, a lavagna vuota, riporta la vista all'origine, così si vede sempre un effetto.
   */
  const fitView = useCallback(() => {
    if (size.width === 0) return;
    const bounds = contentBounds();
    setViewport(
      bounds ? fitBounds(bounds, size, 48, FIT_VIEW_MAX_SCALE) : { x: 0, y: 0, scale: 1 },
    );
  }, [contentBounds, size, setViewport]);

  // Ciò che il giocatore vede entra nella memoria delle zone esplorate (entro la mappa: con la
  // vista illimitata il poligono arriva lontanissimo).
  useEffect(() => {
    if (!explored || !vision.active || vision.visions.length === 0) return;
    const bounds = contentBounds();
    if (!bounds) return;
    const margin = 1000;
    const box = {
      x: bounds.x - margin,
      y: bounds.y - margin,
      width: bounds.width + 2 * margin,
      height: bounds.height + 2 * margin,
    };
    explored.paint(box, (ctx) => {
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.width, box.height);
      ctx.clip();
      drawVisibleArea(ctx, vision.visions, vision.lights, vision.polygons, lighting.ambient);
    });
  }, [
    explored,
    vision.active,
    vision.visions,
    vision.lights,
    vision.polygons,
    lighting.ambient,
    contentBounds,
  ]);

  useBoardShortcuts({ store, role, canEdit, fitToContent: fitView, viewportSize: size });

  /** Il GM può creare gli oggetti già nascosti ai giocatori. */
  const addItems = (newItems: BoardItem[]) =>
    store.add(newItems, { hidden: role === "gm" && createHidden });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Alla prima sincronizzazione centra la vista sul contenuto già presente (una volta sola:
  // gli oggetti disegnati dopo non devono spostare la vista). Se la sincronizzazione arriva
  // tardi e l'utente ha già iniziato a lavorare, la vista resta dov'è: spostarla sotto il
  // cursore farebbe finire il trascinamento successivo in un altro punto della mappa.
  const [synced, setSynced] = useState(provider.synced);
  useEffect(() => {
    const onSynced = () => setSynced(true);
    provider.on("synced", onSynced);
    // La sincronizzazione può essere finita tra il primo render e questo effetto.
    if (provider.synced) setSynced(true);
    return () => {
      provider.off("synced", onSynced);
    };
  }, [provider]);
  useEffect(() => {
    if (fittedRef.current || !synced || size.width === 0) return;
    fittedRef.current = true;
    if (store.canUndo() || store.canRedo()) return;
    fitToContent();
  }, [synced, size.width, fitToContent, store]);

  // Richiamo del GM: i giocatori vengono portati sul punto con una breve animazione. Quello già
  // presente all'ingresso è vecchio e si ignora.
  const summon = useSyncExternalStore(store.subscribe, store.getSummon);
  const summonSeen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!synced) return;
    if (summonSeen.current === undefined) {
      summonSeen.current = summon?.id ?? null;
      return;
    }
    if (!summon || summon.id === summonSeen.current) return;
    summonSeen.current = summon.id;
    if (role === "gm" || size.width === 0) return;
    const from = useBoardUi.getState().viewport;
    const to = centerOn(summon, summon.scale, size);
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / SUMMON_MS);
      const k = 1 - (1 - t) ** 3;
      useBoardUi.getState().setViewport({
        x: from.x + (to.x - from.x) * k,
        y: from.y + (to.y - from.y) * k,
        scale: from.scale + (to.scale - from.scale) * k,
      });
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [summon, synced, role, size]);

  // Tiene il Transformer agganciato ai nodi selezionati (che possono cambiare da remoto).
  // biome-ignore lint/correctness/useExhaustiveDependencies: i nodi Konva cambiano con `items`.
  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage) return;
    const nodes = selectedIds
      // I token hanno un loro indicatore di selezione e la taglia si cambia dal pannello.
      .filter(
        (id) =>
          canEdit(store.get(id)) &&
          !["token", "path", "template"].includes(store.get(id)?.kind ?? "") &&
          id !== editingTextId,
      )
      .map((id) => stage.findOne((node: Konva.Node) => node.hasName("item") && node.id() === id))
      .filter((n): n is Konva.Node => n !== undefined);
    transformer.nodes(nodes);
  }, [selectedIds, items, store, canEdit, editingTextId]);

  // Deseleziona gli oggetti cancellati da altri.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `store.get` dipende da `items`.
  useEffect(() => {
    const existing = selectedIds.filter((id) => store.get(id));
    if (existing.length !== selectedIds.length) select(existing);
  }, [items, selectedIds, store, select]);

  // Deseleziona un muro cancellato da un altro client.
  useEffect(() => {
    if (selectedWallId && !walls.some((wall) => wall.id === selectedWallId)) selectWall(null);
  }, [walls, selectedWallId, selectWall]);

  function pointer(): { screen: Point; world: Point } | null {
    const screen = stageRef.current?.getPointerPosition();
    if (!screen) return null;
    return { screen, world: screenToWorld(viewport, screen) };
  }

  function eraseAt(screen: Point) {
    const hit = stageRef.current?.getIntersection(screen) ?? null;
    const id = findItemId(hit);
    if (id && canEdit(store.get(id))) {
      store.remove([id]);
      return;
    }
    // I muri li vede e li modifica solo il GM.
    const wallId = role === "gm" ? findWallId(hit) : null;
    if (wallId) store.removeWalls([wallId]);
  }

  function base(layer: BoardItem["layer"], at: Point) {
    return {
      id: newItemId(),
      layer,
      x: at.x,
      y: at.y,
      rotation: 0,
      z: store.topZ(layer),
      locked: false,
      createdBy: store.userId,
    };
  }

  function cancelPress() {
    if (pressRef.current) clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  }

  /** Clic prolungato senza muoversi: un ping animato visibile a tutti per un paio di secondi. */
  function startPress(p: { screen: Point; world: Point }, summon = false) {
    cancelPress();
    pressRef.current = {
      screen: p.screen,
      timer: setTimeout(() => {
        pressRef.current = null;
        setInteraction(null);
        provider.setAwarenessField("ping", { id: newItemId(), x: p.world.x, y: p.world.y });
        // Maiusc + pressione prolungata: il GM porta anche i giocatori su quel punto.
        if (summon && role === "gm") store.summon(p.world, viewport.scale);
      }, PING_HOLD_MS),
    };
  }

  function onPointerDown(e: Konva.KonvaEventObject<PointerEvent>) {
    const p = pointer();
    if (!p) return;
    cancelPress();
    if (e.evt.button === 1 || (e.evt.button === 0 && panMode)) {
      setInteraction({ type: "pan", start: p.screen, viewport });
      if (e.evt.button === 0) startPress(p, e.evt.shiftKey);
      return;
    }
    if (e.evt.button !== 0) return;
    // Trascinare un'ancora ridimensiona la selezione: non deve deselezionarla né avviare un ping.
    if (isTransformerPart(e.target)) return;
    const targetId = findItemId(e.target);
    const target = targetId ? store.get(targetId) : undefined;
    const targetWallId = role === "gm" ? findWallId(e.target) : null;
    const targetWall = targetWallId ? store.getWall(targetWallId) : undefined;

    // Modalità «Aggancia a…»: il clic successivo sceglie il token principale (altrove, annulla).
    if (tool === "select" && attachFrom) {
      const child = store.get(attachFrom);
      const problem = attachError(store.getSnapshot(), child, target);
      if (target && problem) setNotice(problem);
      else if (target) store.update({ [attachFrom]: { attachedTo: target.id } });
      useBoardUi.getState().setAttachFrom(null);
      return;
    }

    switch (tool) {
      case "select": {
        if (targetWall) {
          setWallEdit(null);
          selectWall(targetWall.id);
          return;
        }
        if (!canSelect(target, role)) {
          // Su uno spazio vuoto: selezione a riquadro, oppure ping se si resta fermi.
          if (selectedWallId) selectWall(null);
          if (!e.evt.shiftKey) select([]);
          setInteraction({
            type: "marquee",
            start: p.world,
            end: p.world,
            additive: e.evt.shiftKey,
          });
          startPress(p, e.evt.shiftKey);
          return;
        }
        if (e.evt.shiftKey) {
          select(
            selectedIds.includes(target.id)
              ? selectedIds.filter((id) => id !== target.id)
              : [...selectedIds, target.id],
          );
        } else if (!selectedIds.includes(target.id)) {
          select([target.id]);
        }
        return;
      }
      case "pen":
        setInteraction({ type: "stroke", origin: p.world, points: [0, 0] });
        return;
      case "line":
      case "rect":
      case "ellipse":
        setInteraction({ type: "shape", shape: tool, start: p.world, end: p.world });
        return;
      case "text": {
        // Evita che il mousedown che segue sposti il focus e chiuda subito l'editor.
        e.evt.preventDefault();
        // Un clic con un editor già aperto lo chiude (e salva) prima di aprirne un altro.
        if (document.activeElement instanceof HTMLTextAreaElement) document.activeElement.blur();
        if (target?.kind === "text" && canEdit(target)) {
          setEditingText(target.id);
          return;
        }
        // Il nuovo testo entra nella board solo alla conferma: un solo passo di annulla.
        const item: TextItem = {
          ...base("draw", { x: p.world.x, y: p.world.y - (DEFAULT_FONT_SIZE * 1.2) / 2 }),
          kind: "text" as const,
          text: "",
          fontSize: Math.round(DEFAULT_FONT_SIZE / viewport.scale),
          color,
          width: null,
        };
        setDraftText(item);
        return;
      }
      case "eraser":
        setInteraction({ type: "erase" });
        eraseAt(p.screen);
        return;
      case "token":
        placeToken(p.world);
        return;
      case "calibrate":
        setInteraction({ type: "calibrate", start: p.world, end: p.world });
        return;
      case "ruler": {
        clearLinger();
        const shape = useBoardUi.getState().rulerShape;
        if (shape !== "ruler") {
          setInteraction({
            type: "template",
            shape,
            start: p.world,
            end: p.world,
            free: e.evt.altKey,
          });
          return;
        }
        const start = snapRulerPoint(p.world, grid, e.evt.altKey);
        setInteraction({ type: "ruler", points: [start], cursor: start });
        return;
      }
      case "fog":
        if (fogShape === "rect") setInteraction({ type: "fogRect", start: p.world, end: p.world });
        else if (fogShape === "brush")
          setInteraction({ type: "fogBrush", points: [p.world.x, p.world.y] });
        else addPolygonPoint(p.world, "fog");
        return;
      case "terrain":
        if (terrainMode === "region") addPolygonPoint(p.world, "terrain");
        else if (terrainMode === "fill") fillTerrainAt(p.world);
        else if (terrainMode === "copy")
          setInteraction({ type: "terrainCopy", start: p.world, end: p.world });
        else if (terrainMode === "paste") pasteTerrainAt(p.world);
        else
          setInteraction({
            type: "terrainBrush",
            points: [p.world.x, p.world.y],
            erase: terrainMode === "erase",
          });
        return;
      case "path":
        pathDrawing.down(p.world, p.screen, viewport.scale);
        return;
      case "wall":
        wallDrawing.down(p.world, viewport.scale, e.evt.altKey);
        return;
      case "stamp": {
        const first = stampDraft(p.world);
        setInteraction({ type: "stampScatter", stamps: [first], last: p.world });
        return;
      }
      case "light": {
        const preset =
          LIGHT_PRESETS.find((l) => l.id === useBoardUi.getState().lightPreset) ?? LIGHT_PRESETS[1];
        addItems([
          {
            ...base("map", p.world),
            kind: "light",
            bright: preset.bright,
            dim: preset.dim,
            color: preset.color,
          },
        ]);
        return;
      }
    }
  }

  function addPolygonPoint(at: Point, purpose: "fog" | "terrain") {
    if (!polygon) {
      setPolygon({ points: [at.x, at.y], cursor: at, purpose });
      return;
    }
    const [x0 = 0, y0 = 0] = polygon.points;
    const n = polygon.points.length;
    // Clic vicino al primo vertice: chiude il poligono.
    if (n >= 6 && Math.hypot(at.x - x0, at.y - y0) * viewport.scale < 10) {
      finishPolygon();
      return;
    }
    // Un secondo clic sull'ultimo vertice è il doppio clic che chiude il poligono. (Il dblclick
    // di Konva non va bene: scatta anche con due clic rapidi in punti diversi.)
    const lastX = polygon.points[n - 2] as number;
    const lastY = polygon.points[n - 1] as number;
    if (Math.hypot(at.x - lastX, at.y - lastY) * viewport.scale < 4) {
      finishPolygon();
      return;
    }
    setPolygon({ ...polygon, points: [...polygon.points, at.x, at.y], cursor: at });
  }

  function finishPolygon() {
    if (polygon && polygon.points.length >= 6) {
      if (polygon.purpose === "fog") {
        store.addFog({ mode: fogMode, shape: "polygon", points: polygon.points });
      } else {
        commitTerrain({
          biome: terrainBiome,
          mode: "paint",
          shape: "region",
          points: polygon.points,
          ...(terrainExact ? { exact: true } : {}),
        });
      }
    }
    setPolygon(null);
  }

  // Invio chiude il poligono, Esc lo annulla; cambiando strumento si perde.
  useEffect(() => {
    if (!polygon) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter") finishPolygon();
      else if (e.key === "Escape") setPolygon(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  // Scegliere un'immagine subito dopo aver piazzato un token si applica anche a quel token, non
  // solo ai prossimi; cambiando strumento il token non è più "l'ultimo".
  // biome-ignore lint/correctness/useExhaustiveDependencies: si reagisce solo alla scelta.
  useEffect(() => {
    const id = lastTokenRef.current;
    if (!id || useBoardUi.getState().tool !== "token") return;
    const token = store.get(id);
    if (token && canEdit(token)) {
      store.update({ [id]: { assetId: draftAssetId, portrait: draftPortrait } });
    }
  }, [draftAssetId, draftPortrait]);
  useEffect(() => {
    if (tool !== "token") lastTokenRef.current = null;
  }, [tool]);
  useEffect(() => {
    const fogPolygon = tool === "fog" && fogShape === "polygon";
    const terrainRegion = tool === "terrain" && terrainMode === "region";
    if (!fogPolygon && !terrainRegion) setPolygon(null);
  }, [tool, fogShape, terrainMode]);

  /**
   * Salva un'operazione di terreno; con la pittura nascosta la copre subito di nebbia, nella
   * stessa azione (un solo passo di annulla).
   */
  function commitTerrain(op: Omit<TerrainOp, "id" | "seq">) {
    const ui = useBoardUi.getState();
    if (op.mode === "paint") ui.noteBiomeUsed(op.biome);
    if (!ui.terrainUnderFog || op.mode === "erase") {
      store.addTerrainBatch([op]);
      return;
    }
    const covers: Omit<FogOp, "id" | "seq">[] = [];
    if (op.shape === "brush") {
      // Larghezza del pennello più il bordo irregolare e la sfumatura su entrambi i lati.
      covers.push({
        mode: "cover",
        shape: "brush",
        points: op.points,
        width: (op.width ?? 40) * 1.25 + 52,
      });
    } else if (op.shape === "region") {
      covers.push({ mode: "cover", shape: "polygon", points: op.points });
      covers.push({
        mode: "cover",
        shape: "brush",
        points: [...op.points, op.points[0] as number, op.points[1] as number],
        width: 64,
      });
    } else {
      const b = terrainOpBounds({ ...op, id: "", seq: 0 } as TerrainOp);
      covers.push({ mode: "cover", shape: "rect", points: [b.x, b.y, b.width, b.height] });
    }
    store.addTerrainBatch([op], covers);
  }

  /** Riempie l'area chiusa sotto il clic con il bioma scelto. */
  function fillTerrainAt(at: Point) {
    const bounds = contentBounds();
    if (!bounds) {
      setNotice(t("core.board.notices.fillEmpty"));
      return;
    }
    const margin = grid.size * 2;
    const area = {
      x: bounds.x - margin,
      y: bounds.y - margin,
      width: bounds.width + 2 * margin,
      height: bounds.height + 2 * margin,
    };
    const result = terrainFillArea(
      store.getTerrain(),
      store.getWalls(),
      at,
      area,
      grid.size,
      terrainBiome,
    );
    if (!result.ok) {
      setNotice(result.reason);
      return;
    }
    commitTerrain({
      biome: terrainBiome,
      mode: "paint",
      shape: "fill",
      points: result.points,
      rings: result.rings,
    });
  }

  /** Copia le operazioni che disegnano il riquadro; poi si incolla cliccando altrove. */
  function copyTerrain(box: { x: number; y: number; width: number; height: number }) {
    if (box.width * viewport.scale < 4 || box.height * viewport.scale < 4) return;
    const ops = store.getTerrain().filter((op) => boxesIntersect(terrainOpBounds(op), box));
    if (ops.length === 0) {
      setNotice(t("core.board.notices.copyEmpty"));
      return;
    }
    useBoardUi.getState().setTerrain({ terrainClipboard: { box, ops }, terrainMode: "paste" });
    setNotice(t("core.board.notices.copied", { count: ops.length }));
  }

  /** Incolla il terreno copiato centrandolo sul clic, ritagliato al riquadro di origine. */
  function pasteTerrainAt(at: Point) {
    const clipboard = useBoardUi.getState().terrainClipboard;
    if (!clipboard) return;
    const { box } = clipboard;
    const dx = at.x - (box.x + box.width / 2);
    const dy = at.y - (box.y + box.height / 2);
    const ops = clipboard.ops.map(({ id: _id, seq: _seq, ...op }) => {
      // Il ritaglio è il riquadro copiato (intersecato con quello che l'operazione aveva già).
      const [cx = box.x, cy = box.y, cw = box.width, ch = box.height] = op.clip ?? [];
      const x = Math.max(box.x, cx);
      const y = Math.max(box.y, cy);
      const right = Math.min(box.x + box.width, cx + cw);
      const bottom = Math.min(box.y + box.height, cy + ch);
      return {
        ...op,
        points: op.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)),
        clip: [x + dx, y + dy, Math.max(0, right - x), Math.max(0, bottom - y)],
      };
    });
    store.addTerrainBatch(ops);
  }

  function stampDraft(at: Point): StampDraft {
    const { stampId, stampRandom } = useBoardUi.getState();
    const def = STAMPS.find((st) => st.id === stampId) ?? STAMPS[0];
    const furniture = def.group === "furniture";
    return {
      x: at.x,
      y: at.y,
      stamp: def.id,
      size: def.size * (stampRandom && !furniture ? 0.85 + Math.random() * 0.3 : 1),
      // I mobili ruotano di angoli retti, la natura liberamente.
      rotation: stampRandom
        ? furniture
          ? 90 * Math.floor(Math.random() * 4)
          : Math.random() * 360
        : 0,
      variant: stampRandom ? Math.floor(Math.random() * 1000) : 0,
    };
  }

  function placeToken(at: Point) {
    const { tokenDraft } = useBoardUi.getState();
    const existing = store
      .getSnapshot()
      .filter((i): i is TokenItem => i.kind === "token")
      .map((t) => t.name);
    const center = grid.enabled ? snapTokenCenter(at, tokenDraft.size, grid) : at;
    const id = newItemId();
    lastTokenRef.current = id;
    addItems([
      {
        ...base("token", center),
        id,
        kind: "token",
        name: nextTokenName(tokenDraft.name, existing),
        color: tokenDraft.color,
        size: tokenDraft.size,
        assetId: tokenDraft.assetId,
        portrait: tokenDraft.portrait ?? null,
      },
    ]);
  }

  function onPointerMove(e: Konva.KonvaEventObject<PointerEvent>) {
    const p = pointer();
    if (!p) return;
    broadcastCursor(p.world);
    if (tool === "path") pathDrawing.move(p.world, p.screen);
    if (tool === "terrain" && terrainMode === "paste") setPasteCursor(p.world);
    if (tool === "wall") wallDrawing.move(p.world, e.evt.altKey);
    if (
      pressRef.current &&
      Math.hypot(p.screen.x - pressRef.current.screen.x, p.screen.y - pressRef.current.screen.y) > 5
    ) {
      cancelPress();
    }
    if (polygon) setPolygon({ ...polygon, cursor: p.world });
    if (!interaction) return;
    switch (interaction.type) {
      case "pan":
        setViewport({
          ...interaction.viewport,
          x: interaction.viewport.x + p.screen.x - interaction.start.x,
          y: interaction.viewport.y + p.screen.y - interaction.start.y,
        });
        return;
      case "stroke": {
        const { points, origin } = interaction;
        const x = p.world.x - origin.x;
        const y = p.world.y - origin.y;
        const lastX = points[points.length - 2] as number;
        const lastY = points[points.length - 1] as number;
        // Scarta i punti troppo vicini: tratti più leggeri, stesso aspetto.
        if (Math.hypot(x - lastX, y - lastY) * viewport.scale < 2) return;
        const next = [...points, x, y];
        setInteraction({ ...interaction, points: next });
        // Gli altri vedono il tratto mentre lo si disegna (non se è un oggetto nascosto del GM).
        if (!(role === "gm" && createHidden)) {
          broadcastDraft({
            origin,
            points: next,
            color,
            strokeWidth: strokeWidth / viewport.scale,
          });
        }
        return;
      }
      case "ruler": {
        const cursor = snapRulerPoint(p.world, grid, e.evt.altKey);
        setInteraction({ ...interaction, cursor });
        const points = [...interaction.points, cursor];
        broadcastRuler({
          points: flattenPoints(points),
          rise: measureRise(points, visibleTokens, grid),
        });
        return;
      }
      case "template": {
        setInteraction({ ...interaction, end: p.world, free: e.evt.altKey });
        if (!(role === "gm" && createHidden)) {
          broadcastTemplate(
            templateFromDrag(interaction.shape, interaction.start, p.world, grid, e.evt.altKey),
          );
        }
        return;
      }
      case "shape":
      case "calibrate":
      case "fogRect":
      case "marquee":
      case "terrainCopy":
        setInteraction({ ...interaction, end: p.world });
        return;
      case "fogBrush":
        setInteraction({ ...interaction, points: [...interaction.points, p.world.x, p.world.y] });
        return;
      case "stampScatter": {
        // Trascinando si sparge un timbro a ogni passo pari a circa la sua larghezza.
        const spacing =
          (STAMPS.find((st) => st.id === useBoardUi.getState().stampId)?.size ?? 1) *
          grid.size *
          0.9;
        if (Math.hypot(p.world.x - interaction.last.x, p.world.y - interaction.last.y) < spacing)
          return;
        setInteraction({
          ...interaction,
          stamps: [...interaction.stamps, stampDraft(p.world)],
          last: p.world,
        });
        return;
      }
      case "terrainBrush": {
        const n = interaction.points.length;
        const lastX = interaction.points[n - 2] as number;
        const lastY = interaction.points[n - 1] as number;
        if (Math.hypot(p.world.x - lastX, p.world.y - lastY) < terrainWidth / 8) return;
        setInteraction({ ...interaction, points: [...interaction.points, p.world.x, p.world.y] });
        return;
      }
      case "erase":
        eraseAt(p.screen);
        return;
    }
  }

  function onPointerUp(e: Konva.KonvaEventObject<PointerEvent>) {
    cancelPress();
    if (tool === "path") pathDrawing.up();
    const current = interaction;
    setInteraction(null);
    if (!current) return;
    if (current.type === "ruler") {
      broadcastRuler(null);
      return;
    }
    if (current.type === "template") {
      const moved = Math.hypot(current.end.x - current.start.x, current.end.y - current.start.y);
      if (moved < grid.size * 0.3) {
        broadcastTemplate(null);
        return;
      }
      const geometry = templateFromDrag(
        current.shape,
        current.start,
        current.end,
        grid,
        current.free,
      );
      if (e.evt.shiftKey) {
        // Maiusc al rilascio: la sagoma diventa un oggetto che si sposta e si cancella.
        broadcastTemplate(null);
        addItems([
          {
            ...base("draw", geometry),
            rotation: geometry.rotation,
            kind: "template",
            shape: geometry.shape,
            size: geometry.size,
            color: /^#[0-9a-fA-F]{6}$/.test(myColor) ? myColor : "#e5484d",
          },
        ]);
        return;
      }
      setLingering(geometry);
      lingerTimer.current = setTimeout(clearLinger, TEMPLATE_LINGER_MS);
      return;
    }
    if (current.type === "stampScatter") {
      // Tutti i timbri sparsi con un trascinamento sono un solo passo di annulla.
      addItems(
        current.stamps.map((st) => ({
          ...base("map", st),
          rotation: st.rotation,
          kind: "stamp" as const,
          stamp: st.stamp,
          size: st.size,
          variant: st.variant,
        })),
      );
      return;
    }
    if (current.type === "marquee") {
      const box = normalizeBox(current.start, current.end);
      if (box.width * viewport.scale < 4 && box.height * viewport.scale < 4) return;
      const inside = items
        .filter((i) => canSelect(i, role) && boxesIntersect(itemBounds(i, grid.size), box))
        .map((i) => i.id);
      select(current.additive ? [...new Set([...selectedIds, ...inside])] : inside);
      return;
    }
    if (current.type === "stroke") {
      broadcastDraft(null);
      // Un clic senza movimento lascia un punto.
      const points = current.points.length >= 4 ? current.points : [0, 0, 0.01, 0.01];
      const item: StrokeItem = {
        ...base("draw", current.origin),
        kind: "stroke",
        points,
        color,
        strokeWidth: strokeWidth / viewport.scale,
      };
      addItems([item]);
    } else if (current.type === "terrainBrush") {
      commitTerrain({
        biome: terrainBiome,
        mode: current.erase ? "erase" : "paint",
        shape: "brush",
        // Meno punti, stesso aspetto: la pennellata è larga e i bordi già irregolari.
        points: simplify(current.points, Math.max(0.5, terrainWidth / 20)),
        width: terrainWidth,
      });
    } else if (current.type === "terrainCopy") {
      copyTerrain(normalizeBox(current.start, current.end));
    } else if (current.type === "fogRect") {
      const box = normalizeBox(current.start, current.end);
      if (box.width * viewport.scale < 3 || box.height * viewport.scale < 3) return;
      store.addFog({ mode: fogMode, shape: "rect", points: [box.x, box.y, box.width, box.height] });
    } else if (current.type === "fogBrush") {
      const points =
        current.points.length >= 4 ? current.points : [...current.points, ...current.points];
      store.addFog({ mode: fogMode, shape: "brush", points, width: fogBrush / viewport.scale });
    } else if (current.type === "calibrate") {
      const calibration = calibrateFromBox(normalizeBox(current.start, current.end), grid.type);
      if (!calibration) {
        setNotice(t("core.board.notices.calibrationTooSmall"));
        return;
      }
      store.updateGrid({ ...calibration, enabled: true });
      setTool("select");
      setGridPanelOpen(true);
      setNotice(t("core.board.notices.gridCalibrated", { size: calibration.size }));
    } else if (current.type === "shape") {
      const dx = current.end.x - current.start.x;
      const dy = current.end.y - current.start.y;
      if (Math.hypot(dx, dy) * viewport.scale < 3) return;
      const box =
        current.shape === "line"
          ? { x: current.start.x, y: current.start.y, width: dx, height: dy }
          : normalizeBox(current.start, current.end);
      const item: ShapeItem = {
        ...base("draw", box),
        kind: "shape",
        shape: current.shape,
        width: box.width,
        height: box.height,
        color,
        strokeWidth: strokeWidth / viewport.scale,
        fill: filled && current.shape !== "line" ? color : null,
      };
      addItems([item]);
    }
  }

  function onWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const p = pointer();
    if (!p) return;
    // Il pinch sul trackpad arriva come wheel con ctrlKey e delta piccoli.
    const factor = Math.exp(-e.evt.deltaY * (e.evt.ctrlKey ? 0.01 : 0.0015));
    setViewport(zoomAt(viewport, p.screen, factor));
  }

  function toggleDoor(door: Door) {
    if (
      role === "player" &&
      (!canPlayerToggleDoor(door) || isDoorFogged(door, fog) || !isDoorSeen(door, vision.isVisible))
    ) {
      return;
    }
    // Per il GM il clic sblocca e apre anche una porta chiusa a chiave.
    store.updateWall(door.id, { door: door.door === "open" ? "closed" : "open" });
  }

  /** I token si agganciano alla griglia durante il trascinamento (Alt per muoverli liberi). */
  /** Nodi degli oggetti selezionati che si muovono insieme a quello trascinato. */
  function selectedNodes(dragged: Konva.Node): Konva.Node[] {
    const stage = stageRef.current;
    if (!stage) return [dragged];
    const nodeOf = (id: string) =>
      stage.findOne((n: Konva.Node) => n.hasName("item") && n.id() === id);
    const own = selectedIds.includes(dragged.id())
      ? selectedIds
          .filter((id) => canEdit(store.get(id)))
          .map(nodeOf)
          .filter((n): n is Konva.Node => n !== undefined)
      : [dragged];
    // I token agganciati a quelli che si muovono li seguono (se si possono spostare).
    const moving = new Set(own.map((n) => n.id()));
    const riders = followers(store.getSnapshot(), moving)
      .filter((t) => canEdit(t))
      .map((t) => nodeOf(t.id))
      .filter((n): n is Konva.Node => n !== undefined);
    return [...own, ...riders];
  }

  function onItemDragStart(e: Konva.KonvaEventObject<DragEvent>) {
    cancelPress();
    const nodes = selectedNodes(e.target);
    dragLastRef.current = new Map(nodes.map((n) => [n.id(), n.position()]));
    dragStartRef.current = new Map(nodes.map((n) => [n.id(), n.position()]));
    const id = e.target.id();
    if (store.get(id)?.kind === "token") {
      const start = e.target.position();
      setDragMeasure({ id, shared: !store.isHidden(id), points: [start], cursor: start });
    }
  }

  function applyItemDrag(e: Konva.KonvaEventObject<DragEvent>) {
    const dragged = e.target;
    const item = store.get(dragged.id());
    // I token si agganciano alla griglia (Alt per muoverli liberi).
    if (item?.kind === "token" && grid.enabled && !e.evt.altKey) {
      dragged.position(snapTokenCenter(dragged.position(), item.size, grid));
    }
    const lastPositions = dragLastRef.current;
    const lastDragged = lastPositions?.get(dragged.id());
    if (!lastPositions || !lastDragged) return;
    const nodes = selectedNodes(dragged);
    let dx = dragged.x() - lastDragged.x;
    let dy = dragged.y() - lastDragged.y;

    // Controlla ogni passo dall'ultima posizione accettata: anche aggirare un vertice con una
    // curva non deve permettere di attraversare il muro fra due eventi consecutivi del puntatore.
    // Tutti i token seguono lo stesso delta e l'intera selezione si ferma al primo impatto.
    // Soltanto il GM può ignorare il blocco con Alt; per i giocatori Alt disattiva solo lo snap.
    if (role !== "gm" || !e.evt.altKey) {
      let fraction = 1;
      for (const node of nodes) {
        const start = lastPositions.get(node.id());
        if (store.get(node.id())?.kind !== "token" || !start) continue;
        fraction = Math.min(
          fraction,
          movementFraction(start, { x: start.x + dx, y: start.y + dy }, collisionSegments),
        );
        if (fraction === 0) break;
      }
      dx *= fraction;
      dy *= fraction;
    }

    // Gli altri oggetti selezionati (token compresi, che il Transformer non gestisce) seguono.
    for (const node of nodes) {
      const start = lastPositions.get(node.id());
      if (!start) continue;
      const next = { x: start.x + dx, y: start.y + dy };
      node.position(next);
      lastPositions.set(node.id(), next);
    }
    const drag = dragMeasureRef.current;
    if (drag?.id === dragged.id()) setDragMeasure({ ...drag, cursor: dragged.position() });

    // Aggiorna la posizione in tempo reale dei muri ancorati alle immagini trascinate.
    const imageNodes = nodes.filter((n) => store.get(n.id())?.kind === "image");
    if (imageNodes.some((n) => walls.some((w) => w.attachedTo === n.id()))) {
      const offsets = new Map<string, Point>();
      for (const n of imageNodes) {
        const start = dragStartRef.current?.get(n.id());
        if (start) offsets.set(n.id(), { x: n.x() - start.x, y: n.y() - start.y });
      }
      setDraggedWallOffsets(offsets);
    }
  }

  function onItemDragMove(e: Konva.KonvaEventObject<DragEvent>) {
    applyItemDrag(e);
  }

  function onItemDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    const patches: Record<string, ItemPatch> = {};
    const nodes = selectedNodes(e.target);
    const moved = new Set(nodes.map((n) => n.id()));
    for (const node of nodes) {
      patches[node.id()] = { x: node.x(), y: node.y() };
      // Spostare da solo un token agganciato lo sgancia (se si è mosso davvero).
      const item = store.get(node.id());
      if (
        item?.kind === "token" &&
        item.attachedTo &&
        !moved.has(item.attachedTo) &&
        (item.x !== node.x() || item.y !== node.y())
      ) {
        patches[node.id()] = { x: node.x(), y: node.y(), attachedTo: null };
      }
    }
    dragLastRef.current = null;
    dragStartRef.current = null;
    setDraggedWallOffsets(new Map());
    if (dragMeasureRef.current) setDragMeasure(null);
    store.update(patches);
  }

  function onTransformEnd() {
    const patches: Record<string, Record<string, unknown>> = {};
    for (const node of transformerRef.current?.nodes() ?? []) {
      const item = store.get(node.id());
      if (!item) continue;
      patches[item.id] = {
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        ...bakeScale(item, node.scaleX(), node.scaleY()),
      };
      node.scale({ x: 1, y: 1 });
    }
    store.update(patches);
  }

  async function addImages(files: File[], at: Point) {
    // I video (mappe animate) li carica solo il GM.
    const videos = role === "gm" ? files.filter(isSupportedVideo) : [];
    const images = [...files.filter(isSupportedImage), ...videos];
    if (images.length === 0) {
      if (files.some(isSupportedVideo)) setNotice(t("core.board.notices.onlyGmVideo"));
      else if (files.length > 0) setNotice(t("core.board.notices.unsupportedFormat"));
      return;
    }
    // Le immagini del GM vanno sul livello mappa; quelle dei giocatori sopra, tra i disegni.
    const layer = role === "gm" ? "map" : "draw";
    setNotice(t("core.board.notices.uploading", { count: images.length }), undefined, "loading");
    let offset = 0;
    const placed: { x: number; y: number; width: number; height: number }[] = [];
    for (const file of images) {
      try {
        const { assetId, width, height } = await (isSupportedVideo(file)
          ? uploadVideo
          : uploadImage)(roomId, file, gmToken);
        placed.push({ x: at.x - width / 2 + offset, y: at.y - height / 2 + offset, width, height });
        addItems([
          {
            id: newItemId(),
            layer,
            x: at.x - width / 2 + offset,
            y: at.y - height / 2 + offset,
            rotation: 0,
            z: store.topZ(layer),
            locked: false,
            createdBy: store.userId,
            kind: "image",
            assetId,
            width,
            height,
          },
        ]);
        offset += 24 / viewport.scale;
      } catch (error) {
        setNotice(error instanceof UploadError ? error.message : t("core.upload.failed"));
        return;
      }
    }
    if (layer === "map") {
      // Una mappa nuova di solito va scoperta poco alla volta.
      setNotice(t("core.board.notices.mapUploaded", { count: images.length }), {
        label: t("core.board.notices.coverWithFog", { count: images.length }),
        run: () => {
          for (const b of placed) {
            store.addFog({ mode: "cover", shape: "rect", points: [b.x, b.y, b.width, b.height] });
          }
        },
      });
    } else {
      setNotice(null);
    }
  }

  const viewportCenter = useCallback(
    () => screenToWorld(viewport, { x: size.width / 2, y: size.height / 2 }),
    [viewport, size],
  );

  // Incolla immagini dagli appunti. Il listener legge sempre la versione corrente di addImages.
  const addImagesRef = useRef(addImages);
  addImagesRef.current = addImages;
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      void addImagesRef.current(files, viewportCenter());
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [viewportCenter]);

  function onDrop(event: ReactDragEvent) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || files.length === 0) return;
    void addImages(
      files,
      screenToWorld(viewport, { x: event.clientX - rect.left, y: event.clientY - rect.top }),
    );
  }

  useEffect(() => {
    if (!notice || notice.kind === "loading") return;
    const timer = setTimeout(() => setNotice(null), notice.action ? 10000 : 5000);
    return () => clearTimeout(timer);
  }, [notice, setNotice]);

  const cursor =
    interaction?.type === "pan"
      ? "grabbing"
      : panMode
        ? "grab"
        : tool === "select"
          ? "default"
          : tool === "text"
            ? "text"
            : tool === "token"
              ? "copy"
              : "crosshair";

  const editingItem = editingTextId ? store.get(editingTextId) : undefined;

  // Ordine dal basso: terreno, percorsi, mappa, griglia, muri/porte, token, nebbia, disegni.
  // I giocatori non vedono le linee dei muri, ma solo le icone delle porte; la nebbia copre tutto
  // tranne i disegni.
  const pathItems = items.filter((i) => i.layer === "paths");
  // Le luci sono segnaposto: stanno sempre sopra le mappe, anche se queste sono state caricate dopo.
  const mapItems = items
    .filter((i) => i.layer === "map" && (role === "gm" || i.kind !== "light"))
    .sort((a, b) => Number(a.kind === "light") - Number(b.kind === "light"));
  const tokenItems = items.filter((i) => i.layer === "token");
  const drawItems = items.filter((i) => i.layer === "draw");
  const drawnWalls = walls.map((wall) => {
    if (wallEdit?.id === wall.id) return { ...wall, points: wallEdit.points };
    const offset = wall.attachedTo ? draggedWallOffsets.get(wall.attachedTo) : undefined;
    if (offset && (offset.x !== 0 || offset.y !== 0)) {
      return {
        ...wall,
        points: wall.points.map((v, i) => v + (i % 2 === 0 ? offset.x : offset.y)),
      };
    }
    return wall;
  });
  const visibleWorld = {
    ...screenToWorld(viewport, { x: 0, y: 0 }),
    width: size.width / viewport.scale,
    height: size.height / viewport.scale,
  };
  const renderItem = (original: BoardItem) => {
    const item =
      original.kind === "path" && pathEdit?.id === original.id
        ? { ...original, points: pathEdit.points }
        : original;
    return (
      <ItemNode
        key={item.id}
        item={item}
        roomId={roomId}
        cellSize={grid.size}
        draggable={tool === "select" && !panMode && canEdit(item)}
        editing={item.id === editingTextId}
        concealed={store.isHidden(item.id)}
        selected={selectedIds.includes(item.id)}
        turn={item.id === turn.activeId}
        attached={
          item.kind === "token" &&
          !!item.attachedTo &&
          parentOf(store.getSnapshot(), item) !== undefined
        }
        unmasked={role === "gm" && !visionPreview}
        elevationLabel={
          item.kind === "token" && item.elevation
            ? formatElevation(item.elevation, grid)
            : undefined
        }
        ambient={lighting.enabled ? lighting.ambient : undefined}
        onDragStart={onItemDragStart}
        onDragMove={onItemDragMove}
        onDragEnd={onItemDragEnd}
      />
    );
  };

  // Il percorso selezionato (uno solo, modificabile) mostra le maniglie dei punti.
  const editablePath = (() => {
    if (tool !== "select" || selectedIds.length !== 1) return null;
    const item = store.get(selectedIds[0] as string);
    if (item?.kind !== "path" || !canEdit(item)) return null;
    return pathEdit?.id === item.id ? { ...item, points: pathEdit.points } : item;
  })();

  const editableWall = (() => {
    if (tool !== "select" || role !== "gm" || !selectedWallId) return null;
    const wall = store.getWall(selectedWallId);
    if (!wall) return null;
    return wallEdit?.id === wall.id ? { ...wall, points: wallEdit.points } : wall;
  })();

  /** Doppio clic su un percorso selezionato: aggiunge un punto di controllo lì. */
  function onDoubleClick() {
    const p = pointer();
    if (!p || !editablePath) return;
    const local = { x: p.world.x - editablePath.x, y: p.world.y - editablePath.y };
    const controls = toPathPoints(editablePath.points);
    const hit = nearestSegment(controls, local);
    const reach = Math.max(...controls.map((c) => c.w)) / 2 + 10 / viewport.scale;
    if (hit.distance > reach) return;
    store.update({
      [editablePath.id]: { points: toFlat(insertPoint(controls, hit.index, hit.t)) },
    });
    useBoardUi.getState().setPathPoint(hit.index + 1);
  }

  return (
    <div
      ref={containerRef}
      className="board"
      role="application"
      aria-label={t("core.board.label")}
      data-item-count={items.length}
      data-fog-count={fog.length}
      data-terrain-count={terrain.length}
      data-wall-count={walls.length}
      data-synced={synced}
      data-ambient={lighting.enabled ? lighting.ambient : undefined}
      style={{
        cursor,
        // La griglia di puntini segue pan e zoom; con la griglia vera attiva sparisce.
        backgroundImage: grid.enabled ? "none" : undefined,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        backgroundSize: `${24 * viewport.scale}px ${24 * viewport.scale}px`,
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {size.width > 0 && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          x={viewport.x}
          y={viewport.y}
          scaleX={viewport.scale}
          scaleY={viewport.scale}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDblClick={onDoubleClick}
          onPointerLeave={() => {
            cancelPress();
            broadcastCursor(null);
          }}
          onWheel={onWheel}
        >
          <TerrainLayer ops={terrain} visible={visibleWorld} scale={viewport.scale} />
          <Layer>
            {pathItems.map(renderItem)}
            {mapItems.map(renderItem)}
            <GridLines grid={grid} visible={visibleWorld} scale={viewport.scale} />
            <WallLayer
              walls={drawnWalls}
              fog={fog}
              isDoorVisible={(door) => isDoorSeen(door, vision.isVisible)}
              role={role}
              scale={viewport.scale}
              selectedWallId={selectedWallId}
              interactive={tool === "select" && !panMode}
              onToggleDoor={toggleDoor}
            />
            {tokenItems.map(renderItem)}
          </Layer>
          {lighting.enabled && (vision.active || role === "gm") && (
            <VisionLayer
              mode={vision.active ? "view" : "glow"}
              translucent={role === "gm"}
              visions={vision.visions}
              lights={vision.lights}
              polygons={vision.polygons}
              lighting={lighting}
              explored={explored}
              exploredVersion={exploredVersion}
              visible={visibleWorld}
              size={size}
            />
          )}
          <FogLayer ops={fog} translucent={role === "gm"} />
          <Layer>{drawItems.map(renderItem)}</Layer>
          <Layer>
            {editablePath && (
              <PathHandles
                item={editablePath}
                scale={viewport.scale}
                selectedPoint={pathPoint}
                onSelectPoint={(i) => useBoardUi.getState().setPathPoint(i)}
                onChange={(points, commit) => {
                  if (commit) {
                    setPathEdit(null);
                    store.update({ [editablePath.id]: { points } });
                  } else {
                    setPathEdit({ id: editablePath.id, points });
                  }
                }}
              />
            )}
            {editableWall && (
              <WallHandles
                wall={editableWall}
                scale={viewport.scale}
                snap={snapWallPoint}
                onChange={(points, commit) => {
                  if (commit) {
                    setWallEdit(null);
                    store.updateWall(editableWall.id, { points });
                  } else {
                    setWallEdit({ id: editableWall.id, points });
                  }
                }}
              />
            )}
            <Transformer
              ref={transformerRef}
              onTransformEnd={onTransformEnd}
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
              ignoreStroke
              flipEnabled={false}
              anchorSize={9}
              borderStroke="#8e7cf0"
              anchorStroke="#8e7cf0"
            />
          </Layer>
          <Layer listening={false}>
            {interaction?.type === "stroke" && (
              <Line
                x={interaction.origin.x}
                y={interaction.origin.y}
                points={interaction.points}
                stroke={color}
                strokeWidth={strokeWidth / viewport.scale}
                lineCap="round"
                lineJoin="round"
                tension={0.4}
              />
            )}
            {interaction?.type === "calibrate" && (
              <Rect
                {...normalizeBox(interaction.start, interaction.end)}
                stroke={SELECTION_COLOR}
                strokeWidth={2 / viewport.scale}
                dash={[6 / viewport.scale, 4 / viewport.scale]}
                fill="rgba(142, 124, 240, 0.15)"
              />
            )}
            {interaction?.type === "fogRect" && (
              <FogPreview>
                <FogShape
                  op={{
                    mode: "cover",
                    shape: "rect",
                    points: (({ x, y, width, height }) => [x, y, width, height])(
                      normalizeBox(interaction.start, interaction.end),
                    ),
                  }}
                />
              </FogPreview>
            )}
            {interaction?.type === "fogBrush" && (
              <FogPreview>
                <FogShape
                  op={{
                    mode: "cover",
                    shape: "brush",
                    points: interaction.points,
                    width: fogBrush / viewport.scale,
                  }}
                />
              </FogPreview>
            )}
            {interaction?.type === "terrainBrush" && (
              <Line
                points={
                  interaction.points.length >= 4
                    ? interaction.points
                    : [...interaction.points, ...interaction.points]
                }
                stroke={interaction.erase ? "#ffffff" : biomeColor(terrainBiome)}
                strokeWidth={terrainWidth}
                opacity={interaction.erase ? 0.4 : 0.7}
                lineCap="round"
                lineJoin="round"
              />
            )}
            {polygon && (
              <Line
                points={[...polygon.points, polygon.cursor.x, polygon.cursor.y]}
                stroke={SELECTION_COLOR}
                strokeWidth={2 / viewport.scale}
                dash={[6 / viewport.scale, 4 / viewport.scale]}
                fill="rgba(142, 124, 240, 0.2)"
                closed
              />
            )}
            {interaction?.type === "shape" && (
              <ShapePreview
                shape={interaction.shape}
                start={interaction.start}
                end={interaction.end}
                color={color}
                strokeWidth={strokeWidth / viewport.scale}
                filled={filled}
              />
            )}
            {interaction?.type === "terrainCopy" && (
              <Rect
                {...normalizeBox(interaction.start, interaction.end)}
                stroke={SELECTION_COLOR}
                strokeWidth={2 / viewport.scale}
                dash={[6 / viewport.scale, 4 / viewport.scale]}
                fill="rgba(142, 124, 240, 0.12)"
              />
            )}
            {tool === "terrain" && terrainMode === "paste" && terrainClipboard && pasteCursor && (
              <Rect
                x={pasteCursor.x - terrainClipboard.box.width / 2}
                y={pasteCursor.y - terrainClipboard.box.height / 2}
                width={terrainClipboard.box.width}
                height={terrainClipboard.box.height}
                stroke={SELECTION_COLOR}
                strokeWidth={2 / viewport.scale}
                dash={[6 / viewport.scale, 4 / viewport.scale]}
              />
            )}
            {interaction?.type === "stampScatter" &&
              interaction.stamps.map((st, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: i timbri in anteprima non hanno id.
                <Group key={i} x={st.x} y={st.y} rotation={st.rotation} opacity={0.85}>
                  <StampContent item={st} cellSize={grid.size} />
                </Group>
              ))}
            {interaction?.type === "marquee" && (
              <Rect
                {...normalizeBox(interaction.start, interaction.end)}
                stroke={SELECTION_COLOR}
                strokeWidth={1 / viewport.scale}
                fill="rgba(142, 124, 240, 0.12)"
              />
            )}
            {pathDrawing.preview && pathDrawing.preview.length >= 2 && (
              <Group opacity={0.8}>
                <PathShape points={toFlat(pathDrawing.preview)} style={pathStyle} />
              </Group>
            )}
            {wallDrawing.preview && (
              <Line
                name="wall-draft"
                points={wallDrawing.preview}
                stroke={SELECTION_COLOR}
                strokeWidth={4 / viewport.scale}
                dash={
                  wallKind === "invisible" ? [9 / viewport.scale, 6 / viewport.scale] : undefined
                }
                lineCap="round"
                lineJoin="round"
              />
            )}
            {wallDrawing.vertices?.map((point, index) => (
              <Circle
                // biome-ignore lint/suspicious/noArrayIndexKey: i vertici della bozza non hanno id.
                key={index}
                x={point.x}
                y={point.y}
                radius={4 / viewport.scale}
                fill="#ffffff"
                stroke={SELECTION_COLOR}
                strokeWidth={1.5 / viewport.scale}
              />
            ))}
            {pathDrawing.preview?.slice(0, -1).map((pt, i) => (
              <Circle
                // biome-ignore lint/suspicious/noArrayIndexKey: i punti della bozza non hanno id.
                key={i}
                x={pt.x}
                y={pt.y}
                radius={4 / viewport.scale}
                fill="#ffffff"
                stroke={SELECTION_COLOR}
                strokeWidth={1.5 / viewport.scale}
              />
            ))}
            <Presence
              provider={provider}
              scale={viewport.scale}
              grid={grid}
              tokens={visibleTokens}
            />
            {items.map(
              (item) =>
                item.kind === "template" && (
                  <AreaHighlights
                    key={`area-${item.id}`}
                    geometry={item}
                    color={item.color}
                    grid={grid}
                    tokens={visibleTokens}
                  />
                ),
            )}
            {areaShown && (
              <AreaPreview
                geometry={areaShown as TemplateGeometry}
                color={myColor}
                grid={grid}
                tokens={visibleTokens}
                scale={viewport.scale}
              />
            )}
            {interaction?.type === "ruler" && (
              <RulerShape
                points={flattenPoints([...interaction.points, interaction.cursor])}
                rise={rulerRise}
                color={myColor}
                grid={grid}
                scale={viewport.scale}
              />
            )}
            {dragMeasure &&
              (dragMeasure.cursor.x !== (dragMeasure.points.at(-1) as Point).x ||
                dragMeasure.cursor.y !== (dragMeasure.points.at(-1) as Point).y) && (
                <RulerShape
                  points={flattenPoints([...dragMeasure.points, dragMeasure.cursor])}
                  color={myColor}
                  grid={grid}
                  scale={viewport.scale}
                />
              )}
          </Layer>
        </Stage>
      )}
      {draftText && (
        <TextEditor
          key={draftText.id}
          item={draftText}
          viewport={viewport}
          onCommit={(text) => {
            if (text.trim() !== "") addItems([{ ...draftText, text }]);
            setDraftText(null);
          }}
        />
      )}
      {editingItem?.kind === "text" && (
        <TextEditor
          key={editingItem.id}
          item={editingItem}
          viewport={viewport}
          onCommit={(text) => {
            if (text.trim() === "") store.remove([editingItem.id]);
            else if (text !== editingItem.text) store.update({ [editingItem.id]: { text } });
            setEditingText(null);
          }}
        />
      )}
      {tool === "select" && selectedIds.length > 0 && (
        <SelectionPanel store={store} role={role} roomId={roomId} provider={provider} />
      )}
      {tool === "select" && selectedWallId && <WallSelectionPanel store={store} />}
      <div className="visually-hidden" role="status" aria-label={t("core.board.measuredDistance")}>
        {measureText}
      </div>
      <RollToasts provider={provider} />
      <PingArrows
        provider={provider}
        viewport={viewport}
        size={size}
        onFocus={(point) => setViewport(centerOn(point, viewport.scale, size))}
      />
      {initiativeOpen && (
        <InitiativePanel
          store={store}
          role={role}
          tokens={visibleTokens}
          onClose={() => useBoardUi.getState().setInitiativeOpen(false)}
        />
      )}
      <TokenList
        // Al buio i token degli altri non si vedono: nemmeno nell'elenco per gli screen reader.
        items={
          vision.active ? items.filter((i) => i.kind !== "token" || vision.isVisible(i)) : items
        }
        grid={grid}
        isHidden={(id) => store.isHidden(id)}
      />
      <Toolbar
        provider={provider}
        store={store}
        role={role}
        roomId={roomId}
        onUpload={(files) => void addImages(files, viewportCenter())}
        onFit={fitView}
        viewportSize={size}
      />
      {notice && (
        <div className="board-notice" role="status">
          {notice.text}
          {notice.action && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                notice.action?.run();
                setNotice(null);
              }}
            >
              {notice.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Anteprima di un'operazione di nebbia: viola per coprire, tratteggio per scoprire. */
function FogPreview({ children }: { children: ReactNode }) {
  const mode = useBoardUi((s) => s.fogMode);
  return (
    <Group opacity={mode === "cover" ? 0.45 : 0.25} listening={false}>
      {children}
    </Group>
  );
}
