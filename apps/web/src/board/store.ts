import {
  type BoardItem,
  boardItemSchema,
  compareItems,
  DEFAULT_GRID,
  type GridSettings,
  gridSettingsSchema,
  ITEMS_MAP,
  type Layer,
  SETTINGS_MAP,
} from "@scryboard/shared";
import * as Y from "yjs";

/** Modifica parziale di un oggetto: non si può cambiare tipo né id. */
export type ItemPatch = Partial<Omit<BoardItem, "id" | "kind">> & Record<string, unknown>;

/**
 * Oggetti della board salvati in una Y.Map (id → oggetto). Espone uno snapshot ordinato e
 * immutabile per React e un annulla/ripeti limitato alle modifiche di questo client.
 */
export class BoardStore {
  private readonly map: Y.Map<unknown>;
  private readonly settings: Y.Map<unknown>;
  private readonly undoManager: Y.UndoManager;
  private grid: GridSettings = DEFAULT_GRID;
  private readonly byId = new Map<string, BoardItem>();
  private sorted: BoardItem[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly doc: Y.Doc,
    readonly userId: string,
  ) {
    this.map = doc.getMap(ITEMS_MAP);
    this.settings = doc.getMap(SETTINGS_MAP);
    this.undoManager = new Y.UndoManager([this.map, this.settings], {
      trackedOrigins: new Set([this]),
    });
    this.loadSettings();
    this.settings.observe(() => {
      this.loadSettings();
      this.emit();
    });
    for (const key of this.map.keys()) this.load(key);
    this.resort();
    this.map.observe((event) => {
      for (const key of event.keysChanged) this.load(key);
      this.resort();
    });
    this.undoManager.on("stack-item-added", () => this.emit());
    this.undoManager.on("stack-item-popped", () => this.emit());
  }

  /** Gli oggetti non validi (es. da client più vecchi o malevoli) vengono ignorati. */
  private load(key: string) {
    const parsed = boardItemSchema.safeParse(this.map.get(key));
    if (parsed.success && parsed.data.id === key) this.byId.set(key, parsed.data);
    else this.byId.delete(key);
  }

  private loadSettings() {
    const parsed = gridSettingsSchema.safeParse(this.settings.get("grid"));
    this.grid = parsed.success ? parsed.data : DEFAULT_GRID;
  }

  private resort() {
    this.sorted = [...this.byId.values()].sort(compareItems);
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): BoardItem[] => this.sorted;

  getGrid = (): GridSettings => this.grid;

  updateGrid(patch: Partial<GridSettings>) {
    const next = { ...this.grid, ...patch };
    if (!gridSettingsSchema.safeParse(next).success) return;
    this.transact(() => this.settings.set("grid", next));
  }

  get(id: string): BoardItem | undefined {
    return this.byId.get(id);
  }

  /** z per mettere un nuovo oggetto in cima al suo livello. */
  topZ(layer: Layer): number {
    let max = 0;
    for (const item of this.byId.values()) if (item.layer === layer && item.z > max) max = item.z;
    return max + 1;
  }

  private bottomZ(layer: Layer): number {
    let min = 0;
    for (const item of this.byId.values()) if (item.layer === layer && item.z < min) min = item.z;
    return min - 1;
  }

  /** Ogni chiamata è un'azione dell'utente: un passo di annulla a sé, anche se ravvicinata. */
  private transact(fn: () => void) {
    this.undoManager.stopCapturing();
    this.doc.transact(fn, this);
  }

  add(...items: BoardItem[]) {
    this.transact(() => {
      for (const item of items) this.map.set(item.id, item);
    });
  }

  update(patches: Record<string, ItemPatch>) {
    this.transact(() => {
      for (const [id, patch] of Object.entries(patches)) {
        const current = this.byId.get(id);
        if (current) this.map.set(id, { ...current, ...patch, id, kind: current.kind });
      }
    });
  }

  remove(ids: Iterable<string>) {
    this.transact(() => {
      for (const id of ids) this.map.delete(id);
    });
  }

  bringToFront(ids: string[]) {
    this.reorder(ids, (item) => this.topZ(item.layer));
  }

  sendToBack(ids: string[]) {
    this.reorder(ids, (item) => this.bottomZ(item.layer), true);
  }

  private reorder(ids: string[], nextZ: (item: BoardItem) => number, reverse = false) {
    // Mantiene l'ordine relativo degli oggetti spostati: verso il fondo si parte dal più alto.
    const items = ids
      .map((id) => this.byId.get(id))
      .filter((i): i is BoardItem => i !== undefined)
      .sort(compareItems);
    if (reverse) items.reverse();
    this.transact(() => {
      for (const item of items) {
        const z = nextZ(item);
        this.map.set(item.id, { ...item, z });
        this.byId.set(item.id, { ...item, z });
      }
    });
  }

  undo() {
    this.undoManager.undo();
  }

  redo() {
    this.undoManager.redo();
  }

  canUndo(): boolean {
    return this.undoManager.canUndo();
  }

  canRedo(): boolean {
    return this.undoManager.canRedo();
  }

  destroy() {
    this.undoManager.destroy();
    this.listeners.clear();
  }
}

/** Id casuale; non usa crypto.randomUUID, disponibile solo in contesti sicuri (HTTPS/localhost). */
export function newItemId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
