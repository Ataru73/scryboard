import type { HocuspocusProvider } from "@hocuspocus/provider";
import type {
  BoardItem,
  Role,
  ShapeItem,
  StrokeItem,
  TerrainOp,
  TextItem,
  TokenItem,
} from "@scryboard/shared";
import { canModify, canSelect } from "@scryboard/shared";
import type Konva from "konva";
import {
  type DragEvent as ReactDragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Circle, Group, Layer, Line, Rect, Stage, Transformer } from "react-konva";
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
import { simplify, terrainOpBounds } from "../terrain/geometry";
import { biomeColor } from "../terrain/textures";
import { useAssetAuth } from "./assetAuth";
import { FogLayer, FogShape } from "./FogLayer";
import { GridLines } from "./GridLines";
import { bakeScale, boxesIntersect, itemBounds, normalizeBox, unionBounds } from "./geometry";
import { calibrateFromBox, nextTokenName, snapTokenCenter } from "./grid";
import { ItemNode, SELECTION_COLOR } from "./ItemNode";
import { type DraftStroke, Presence, useAwarenessBroadcast } from "./Presence";
import { SelectionPanel } from "./SelectionPanel";
import { ShapePreview } from "./ShapePreview";
import { type BoardStore, newItemId } from "./store";
import { TerrainLayer } from "./TerrainLayer";
import { TextEditor } from "./TextEditor";
import { TokenList } from "./TokenList";
import { Toolbar } from "./Toolbar";
import { useBoardUi } from "./tools";
import { isSupportedImage, UploadError, uploadImage } from "./upload";
import { useBoardShortcuts } from "./useBoardShortcuts";
import { fitBounds, type Point, screenToWorld, type Viewport, zoomAt } from "./viewport";

interface Props {
  store: BoardStore;
  provider: HocuspocusProvider;
  roomId: string;
  role: Role;
}

type Interaction =
  | { type: "pan"; start: Point; viewport: Viewport }
  | { type: "stroke"; origin: Point; points: number[] }
  | { type: "shape"; shape: ShapeItem["shape"]; start: Point; end: Point }
  | { type: "erase" }
  | { type: "calibrate"; start: Point; end: Point }
  | { type: "fogRect"; start: Point; end: Point }
  | { type: "fogBrush"; points: number[] }
  | { type: "marquee"; start: Point; end: Point; additive: boolean }
  | { type: "terrainBrush"; points: number[]; erase: boolean };

/** Tempo di pressione, senza muoversi, che lancia un ping. */
const PING_HOLD_MS = 550;

interface Notice {
  text: string;
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

/** Risale dal nodo colpito al gruppo che rappresenta un oggetto della board. */
function findItemId(node: Konva.Node | null): string | null {
  let current: Konva.Node | null = node;
  while (current) {
    if (current.hasName("item")) return current.id();
    current = current.getParent();
  }
  return null;
}

export function Board({ store, provider, roomId, role }: Props) {
  const items = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const grid = useSyncExternalStore(store.subscribe, store.getGrid);
  const fog = useSyncExternalStore(store.subscribe, store.getFog);
  const terrain = useSyncExternalStore(store.subscribe, store.getTerrain);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);

  const transformerRef = useRef<Konva.Transformer>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const [notice, setNoticeState] = useState<Notice | null>(null);
  const setNotice = useCallback(
    (text: string | null, action?: Notice["action"]) =>
      setNoticeState(text ? { text, action } : null),
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
  const fogMode = useBoardUi((s) => s.fogMode);
  const fogShape = useBoardUi((s) => s.fogShape);
  const fogBrush = useBoardUi((s) => s.fogBrush);
  const createHidden = useBoardUi((s) => s.createHidden);
  const terrainBiome = useBoardUi((s) => s.terrainBiome);
  const terrainMode = useBoardUi((s) => s.terrainMode);
  const terrainSize = useBoardUi((s) => s.terrainSize);
  /** Larghezza del pennello del terreno in pixel del mondo: segue la casella della griglia. */
  const terrainWidth = terrainSize * grid.size;
  const pathStyle = useBoardUi((s) => s.pathStyle);
  const pathPoint = useBoardUi((s) => s.pathPoint);
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
  const { select, setViewport, setEditingText, setTool, setGridPanelOpen } = useBoardUi.getState();

  const canEdit = useCallback((item: BoardItem | undefined) => canModify(item, role), [role]);
  const panMode = tool === "hand" || spacePan;
  const broadcastCursor = useAwarenessBroadcast<Point>(provider, "cursor");
  const broadcastDraft = useAwarenessBroadcast<DraftStroke>(provider, "draft");
  const pressRef = useRef<{ timer: ReturnType<typeof setTimeout>; screen: Point } | null>(null);
  /** Posizioni iniziali degli oggetti selezionati durante un trascinamento. */
  const dragStartRef = useRef<Map<string, Point> | null>(null);
  const gmToken = useAssetAuth();

  const fitToContent = useCallback(() => {
    const itemBox = unionBounds(store.getSnapshot(), store.getGrid().size);
    const terrainBox = terrainBounds(store.getTerrain());
    const boxes = [itemBox, terrainBox].filter((b): b is NonNullable<typeof b> => b !== null);
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
    if (bounds && size.width > 0) setViewport(fitBounds(bounds, size));
  }, [store, size, setViewport]);

  useBoardShortcuts({ store, role, canEdit, fitToContent, viewportSize: size });

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
  // gli oggetti disegnati dopo non devono spostare la vista).
  const [synced, setSynced] = useState(provider.synced);
  useEffect(() => {
    const onSynced = () => setSynced(true);
    provider.on("synced", onSynced);
    return () => {
      provider.off("synced", onSynced);
    };
  }, [provider]);
  useEffect(() => {
    if (fittedRef.current || !synced || size.width === 0) return;
    fittedRef.current = true;
    fitToContent();
  }, [synced, size.width, fitToContent]);

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
          !["token", "path"].includes(store.get(id)?.kind ?? "") &&
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

  function pointer(): { screen: Point; world: Point } | null {
    const screen = stageRef.current?.getPointerPosition();
    if (!screen) return null;
    return { screen, world: screenToWorld(viewport, screen) };
  }

  function eraseAt(screen: Point) {
    const id = findItemId(stageRef.current?.getIntersection(screen) ?? null);
    if (id && canEdit(store.get(id))) store.remove([id]);
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
  function startPress(p: { screen: Point; world: Point }) {
    cancelPress();
    pressRef.current = {
      screen: p.screen,
      timer: setTimeout(() => {
        pressRef.current = null;
        setInteraction(null);
        provider.setAwarenessField("ping", { id: newItemId(), x: p.world.x, y: p.world.y });
      }, PING_HOLD_MS),
    };
  }

  function onPointerDown(e: Konva.KonvaEventObject<PointerEvent>) {
    const p = pointer();
    if (!p) return;
    cancelPress();
    if (e.evt.button === 1 || (e.evt.button === 0 && panMode)) {
      setInteraction({ type: "pan", start: p.screen, viewport });
      if (e.evt.button === 0) startPress(p);
      return;
    }
    if (e.evt.button !== 0) return;
    const targetId = findItemId(e.target);
    const target = targetId ? store.get(targetId) : undefined;

    switch (tool) {
      case "select": {
        if (!canSelect(target, role)) {
          // Su uno spazio vuoto: selezione a riquadro, oppure ping se si resta fermi.
          if (!e.evt.shiftKey) select([]);
          setInteraction({
            type: "marquee",
            start: p.world,
            end: p.world,
            additive: e.evt.shiftKey,
          });
          startPress(p);
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
      case "fog":
        if (fogShape === "rect") setInteraction({ type: "fogRect", start: p.world, end: p.world });
        else if (fogShape === "brush")
          setInteraction({ type: "fogBrush", points: [p.world.x, p.world.y] });
        else addPolygonPoint(p.world, "fog");
        return;
      case "terrain":
        if (terrainMode === "region") addPolygonPoint(p.world, "terrain");
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
        store.addTerrain({
          biome: terrainBiome,
          mode: "paint",
          shape: "region",
          points: polygon.points,
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
  useEffect(() => {
    const fogPolygon = tool === "fog" && fogShape === "polygon";
    const terrainRegion = tool === "terrain" && terrainMode === "region";
    if (!fogPolygon && !terrainRegion) setPolygon(null);
  }, [tool, fogShape, terrainMode]);

  function placeToken(at: Point) {
    const { tokenDraft } = useBoardUi.getState();
    const existing = store
      .getSnapshot()
      .filter((i): i is TokenItem => i.kind === "token")
      .map((t) => t.name);
    const center = grid.enabled ? snapTokenCenter(at, tokenDraft.size, grid) : at;
    addItems([
      {
        ...base("token", center),
        kind: "token",
        name: nextTokenName(tokenDraft.name, existing),
        color: tokenDraft.color,
        size: tokenDraft.size,
        assetId: tokenDraft.assetId,
      },
    ]);
  }

  function onPointerMove() {
    const p = pointer();
    if (!p) return;
    broadcastCursor(p.world);
    if (tool === "path") pathDrawing.move(p.world, p.screen);
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
      case "shape":
      case "calibrate":
      case "fogRect":
      case "marquee":
        setInteraction({ ...interaction, end: p.world });
        return;
      case "fogBrush":
        setInteraction({ ...interaction, points: [...interaction.points, p.world.x, p.world.y] });
        return;
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

  function onPointerUp() {
    cancelPress();
    if (tool === "path") pathDrawing.up();
    const current = interaction;
    setInteraction(null);
    if (!current) return;
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
      store.addTerrain({
        biome: terrainBiome,
        mode: current.erase ? "erase" : "paint",
        shape: "brush",
        // Meno punti, stesso aspetto: la pennellata è larga e i bordi già irregolari.
        points: simplify(current.points, Math.max(0.5, terrainWidth / 20)),
        width: terrainWidth,
      });
    } else if (current.type === "fogRect") {
      const box = normalizeBox(current.start, current.end);
      if (box.width * viewport.scale < 3 || box.height * viewport.scale < 3) return;
      store.addFog({ mode: fogMode, shape: "rect", points: [box.x, box.y, box.width, box.height] });
    } else if (current.type === "fogBrush") {
      const points =
        current.points.length >= 4 ? current.points : [...current.points, ...current.points];
      store.addFog({ mode: fogMode, shape: "brush", points, width: fogBrush / viewport.scale });
    } else if (current.type === "calibrate") {
      const calibration = calibrateFromBox(normalizeBox(current.start, current.end));
      if (!calibration) {
        setNotice("Riquadro troppo piccolo: traccia il bordo di una casella della mappa.");
        return;
      }
      store.updateGrid({ ...calibration, enabled: true });
      setTool("select");
      setGridPanelOpen(true);
      setNotice(`Griglia calibrata: caselle di ${calibration.size} px.`);
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

  /** I token si agganciano alla griglia durante il trascinamento (Alt per muoverli liberi). */
  /** Nodi degli oggetti selezionati che si muovono insieme a quello trascinato. */
  function selectedNodes(dragged: Konva.Node): Konva.Node[] {
    const stage = stageRef.current;
    if (!stage || !selectedIds.includes(dragged.id())) return [dragged];
    return selectedIds
      .filter((id) => canEdit(store.get(id)))
      .map((id) => stage.findOne((n: Konva.Node) => n.hasName("item") && n.id() === id))
      .filter((n): n is Konva.Node => n !== undefined);
  }

  function onItemDragStart(e: Konva.KonvaEventObject<DragEvent>) {
    cancelPress();
    dragStartRef.current = new Map(selectedNodes(e.target).map((n) => [n.id(), n.position()]));
  }

  function onItemDragMove(e: Konva.KonvaEventObject<DragEvent>) {
    const dragged = e.target;
    const item = store.get(dragged.id());
    // I token si agganciano alla griglia (Alt per muoverli liberi).
    if (item?.kind === "token" && grid.enabled && !e.evt.altKey) {
      dragged.position(snapTokenCenter(dragged.position(), item.size, grid));
    }
    // Gli altri oggetti selezionati (token compresi, che il Transformer non gestisce) seguono.
    const starts = dragStartRef.current;
    const origin = starts?.get(dragged.id());
    if (!starts || !origin) return;
    const dx = dragged.x() - origin.x;
    const dy = dragged.y() - origin.y;
    for (const node of selectedNodes(dragged)) {
      const start = starts.get(node.id());
      if (node !== dragged && start) node.position({ x: start.x + dx, y: start.y + dy });
    }
  }

  function onItemDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    const patches: Record<string, { x: number; y: number }> = {};
    for (const node of selectedNodes(e.target)) patches[node.id()] = { x: node.x(), y: node.y() };
    dragStartRef.current = null;
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
    const images = files.filter(isSupportedImage);
    if (images.length === 0) {
      if (files.length > 0) setNotice("Formato non supportato: usa PNG, JPEG, WebP o GIF.");
      return;
    }
    // Le immagini del GM vanno sul livello mappa; quelle dei giocatori sopra, tra i disegni.
    const layer = role === "gm" ? "map" : "draw";
    setNotice(
      images.length === 1 ? "Caricamento immagine…" : `Caricamento di ${images.length} immagini…`,
    );
    let offset = 0;
    const placed: { x: number; y: number; width: number; height: number }[] = [];
    for (const file of images) {
      try {
        const { assetId, width, height } = await uploadImage(roomId, file, gmToken);
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
        setNotice(error instanceof UploadError ? error.message : "Caricamento non riuscito.");
        return;
      }
    }
    if (layer === "map") {
      // Una mappa nuova di solito va scoperta poco alla volta.
      setNotice(images.length === 1 ? "Mappa caricata." : "Mappe caricate.", {
        label: "Coprila con la nebbia",
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
    if (!notice || notice.text.startsWith("Caricamento")) return;
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

  // Ordine dal basso: terreno, percorsi, mappa, griglia, token, nebbia, disegni. La nebbia copre
  // tutto tranne i disegni.
  const pathItems = items.filter((i) => i.layer === "paths");
  const mapItems = items.filter((i) => i.layer === "map");
  const tokenItems = items.filter((i) => i.layer === "token");
  const drawItems = items.filter((i) => i.layer === "draw");
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
      aria-label="Lavagna"
      data-item-count={items.length}
      data-fog-count={fog.length}
      data-terrain-count={terrain.length}
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
            {tokenItems.map(renderItem)}
          </Layer>
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
            <Presence provider={provider} scale={viewport.scale} />
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
        <SelectionPanel store={store} role={role} roomId={roomId} />
      )}
      <TokenList items={items} grid={grid} isHidden={(id) => store.isHidden(id)} />
      <Toolbar
        store={store}
        role={role}
        roomId={roomId}
        onUpload={(files) => void addImages(files, viewportCenter())}
        onFit={fitToContent}
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
