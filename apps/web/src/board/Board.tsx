import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { BoardItem, Role, ShapeItem, StrokeItem, TextItem } from "@scryboard/shared";
import type Konva from "konva";
import {
  type DragEvent as ReactDragEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Layer, Line, Stage, Transformer } from "react-konva";
import { Cursors, useCursorBroadcast } from "./Cursors";
import { bakeScale, normalizeBox, unionBounds } from "./geometry";
import { ItemNode } from "./ItemNode";
import { ShapePreview } from "./ShapePreview";
import { type BoardStore, newItemId } from "./store";
import { TextEditor } from "./TextEditor";
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
  | { type: "erase" };

const DEFAULT_FONT_SIZE = 24;

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
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const contentLayerRef = useRef<Konva.Layer>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
  const { select, setViewport, setEditingText } = useBoardUi.getState();

  const canEdit = useCallback(
    (item: BoardItem | undefined) =>
      item !== undefined && (role === "gm" || (item.layer !== "map" && !item.locked)),
    [role],
  );
  const panMode = tool === "hand" || spacePan;
  const broadcastCursor = useCursorBroadcast(provider);

  const fitToContent = useCallback(() => {
    const bounds = unionBounds(store.getSnapshot());
    if (bounds && size.width > 0) setViewport(fitBounds(bounds, size));
  }, [store, size, setViewport]);

  useBoardShortcuts({ store, canEdit, fitToContent, viewportSize: size });

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
    const layer = contentLayerRef.current;
    if (!transformer || !layer) return;
    const nodes = selectedIds
      .filter((id) => canEdit(store.get(id)) && id !== editingTextId)
      .map((id) => layer.findOne((node: Konva.Node) => node.hasName("item") && node.id() === id))
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
    const id = findItemId(contentLayerRef.current?.getIntersection(screen) ?? null);
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

  function onPointerDown(e: Konva.KonvaEventObject<PointerEvent>) {
    const p = pointer();
    if (!p) return;
    if (e.evt.button === 1 || (e.evt.button === 0 && panMode)) {
      setInteraction({ type: "pan", start: p.screen, viewport });
      return;
    }
    if (e.evt.button !== 0) return;
    const targetId = findItemId(e.target);
    const target = targetId ? store.get(targetId) : undefined;

    switch (tool) {
      case "select": {
        if (!target || !canEdit(target)) {
          select([]);
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
    }
  }

  function onPointerMove() {
    const p = pointer();
    if (!p) return;
    broadcastCursor(p.world);
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
        setInteraction({ ...interaction, points: [...points, x, y] });
        return;
      }
      case "shape":
        setInteraction({ ...interaction, end: p.world });
        return;
      case "erase":
        eraseAt(p.screen);
        return;
    }
  }

  function onPointerUp() {
    const current = interaction;
    setInteraction(null);
    if (!current) return;
    if (current.type === "stroke") {
      // Un clic senza movimento lascia un punto.
      const points = current.points.length >= 4 ? current.points : [0, 0, 0.01, 0.01];
      const item: StrokeItem = {
        ...base("draw", current.origin),
        kind: "stroke",
        points,
        color,
        strokeWidth: strokeWidth / viewport.scale,
      };
      store.add(item);
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
      store.add(item);
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

  function onItemDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    const dragged = e.target;
    const selected = transformerRef.current?.nodes() ?? [];
    // Trascinando un oggetto selezionato, il Transformer sposta anche gli altri.
    const nodes = selected.includes(dragged) ? selected : [dragged];
    const patches: Record<string, { x: number; y: number }> = {};
    for (const node of nodes) patches[node.id()] = { x: node.x(), y: node.y() };
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

  const addImages = useCallback(
    async (files: File[], at: Point) => {
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
      for (const file of images) {
        try {
          const { assetId, width, height } = await uploadImage(roomId, file);
          store.add({
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
          });
          offset += 24 / viewport.scale;
        } catch (error) {
          setNotice(error instanceof UploadError ? error.message : "Caricamento non riuscito.");
          return;
        }
      }
      setNotice(null);
    },
    [role, roomId, store, viewport.scale],
  );

  const viewportCenter = useCallback(
    () => screenToWorld(viewport, { x: size.width / 2, y: size.height / 2 }),
    [viewport, size],
  );

  // Incolla immagini dagli appunti.
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      void addImages(files, viewportCenter());
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addImages, viewportCenter]);

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
    if (!notice || notice.startsWith("Caricamento")) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const cursor =
    interaction?.type === "pan"
      ? "grabbing"
      : panMode
        ? "grab"
        : tool === "select"
          ? "default"
          : tool === "text"
            ? "text"
            : "crosshair";

  const editingItem = editingTextId ? store.get(editingTextId) : undefined;

  return (
    <div
      ref={containerRef}
      className="board"
      role="application"
      aria-label="Lavagna"
      data-item-count={items.length}
      style={{
        cursor,
        // La griglia di puntini segue pan e zoom.
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
          onPointerLeave={() => broadcastCursor(null)}
          onWheel={onWheel}
        >
          <Layer ref={contentLayerRef}>
            {items.map((item) => (
              <ItemNode
                key={item.id}
                item={item}
                roomId={roomId}
                draggable={tool === "select" && !panMode && canEdit(item)}
                hidden={item.id === editingTextId}
                onDragEnd={onItemDragEnd}
              />
            ))}
          </Layer>
          <Layer>
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
            <Cursors provider={provider} scale={viewport.scale} />
          </Layer>
        </Stage>
      )}
      {draftText && (
        <TextEditor
          key={draftText.id}
          item={draftText}
          viewport={viewport}
          onCommit={(text) => {
            if (text.trim() !== "") store.add({ ...draftText, text });
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
      <Toolbar
        store={store}
        onUpload={(files) => void addImages(files, viewportCenter())}
        onFit={fitToContent}
        viewportSize={size}
      />
      {notice && <div className="board-notice">{notice}</div>}
    </div>
  );
}
