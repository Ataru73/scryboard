import {
  type BoardItem,
  boardItemSchema,
  compareItems,
  DEFAULT_GRID,
  FOG_MAP,
  type FogOp,
  fogOpSchema,
  type GridSettings,
  gridSettingsSchema,
  ITEMS_MAP,
  type Layer,
  SETTINGS_MAP,
} from "@scryboard/shared";
import * as Y from "yjs";

/** Modifica parziale di un oggetto: non si può cambiare tipo né id. */
export type ItemPatch = Partial<Omit<BoardItem, "id" | "kind">> & Record<string, unknown>;

interface DocPart {
  doc: Y.Doc;
  items: Y.Map<unknown>;
  undo: Y.UndoManager;
  /** Oggetti validi di questo documento. */
  loaded: Map<string, BoardItem>;
}

/**
 * Stato della board costruito su due documenti Yjs: quello pubblico (oggetti visibili, griglia,
 * nebbia) e, solo per il GM, quello con gli oggetti nascosti. Espone snapshot immutabili per
 * React e un annulla/ripeti per azione che può coinvolgere entrambi i documenti (ad esempio
 * nascondere un oggetto lo sposta dall'uno all'altro).
 */
export class BoardStore {
  private readonly pub: DocPart;
  private readonly gm: DocPart | null;
  private readonly settings: Y.Map<unknown>;
  private readonly fogMap: Y.Map<unknown>;
  private grid: GridSettings = DEFAULT_GRID;
  private fog: FogOp[] = [];
  private readonly byId = new Map<string, BoardItem>();
  private sorted: BoardItem[] = [];
  private readonly listeners = new Set<() => void>();
  /** Ogni voce elenca gli UndoManager che l'azione ha toccato, da annullare insieme. */
  private history: Y.UndoManager[][] = [];
  private future: Y.UndoManager[][] = [];
  private seq = 0;

  constructor(
    publicDoc: Y.Doc,
    gmDoc: Y.Doc | null,
    readonly userId: string,
  ) {
    this.settings = publicDoc.getMap(SETTINGS_MAP);
    this.fogMap = publicDoc.getMap(FOG_MAP);
    this.pub = this.part(publicDoc, [this.settings, this.fogMap]);
    this.gm = gmDoc ? this.part(gmDoc, []) : null;

    this.loadSettings();
    this.settings.observe(() => {
      this.loadSettings();
      this.emit();
    });
    this.loadFog();
    this.fogMap.observe(() => {
      this.loadFog();
      this.emit();
    });
    this.rebuild();
  }

  private part(doc: Y.Doc, extraScope: Y.Map<unknown>[]): DocPart {
    const items = doc.getMap<unknown>(ITEMS_MAP);
    const part: DocPart = {
      doc,
      items,
      undo: new Y.UndoManager([items, ...extraScope], { trackedOrigins: new Set([this]) }),
      loaded: new Map(),
    };
    for (const key of items.keys()) this.load(part, key);
    items.observe((event) => {
      for (const key of event.keysChanged) this.load(part, key);
      this.rebuild();
    });
    return part;
  }

  /** Gli oggetti non validi (es. da client più vecchi o malevoli) vengono ignorati. */
  private load(part: DocPart, key: string) {
    const parsed = boardItemSchema.safeParse(part.items.get(key));
    if (parsed.success && parsed.data.id === key) part.loaded.set(key, parsed.data);
    else part.loaded.delete(key);
  }

  private loadSettings() {
    const parsed = gridSettingsSchema.safeParse(this.settings.get("grid"));
    this.grid = parsed.success ? parsed.data : DEFAULT_GRID;
  }

  private loadFog() {
    const ops: FogOp[] = [];
    for (const value of this.fogMap.values()) {
      const parsed = fogOpSchema.safeParse(value);
      if (parsed.success) ops.push(parsed.data);
    }
    this.fog = ops.sort((a, b) => a.seq - b.seq || (a.id < b.id ? -1 : 1));
  }

  private rebuild() {
    this.byId.clear();
    // Se per un attimo un oggetto è in entrambi i documenti, vince quello pubblico.
    for (const [id, item] of this.gm?.loaded ?? []) this.byId.set(id, item);
    for (const [id, item] of this.pub.loaded) this.byId.set(id, item);
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
  getFog = (): FogOp[] => this.fog;

  get(id: string): BoardItem | undefined {
    return this.byId.get(id);
  }

  /** Nascosto = presente solo nel documento del GM. */
  isHidden(id: string): boolean {
    return !this.pub.loaded.has(id) && (this.gm?.loaded.has(id) ?? false);
  }

  get canHide(): boolean {
    return this.gm !== null;
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

  private partOf(id: string): DocPart | null {
    if (this.pub.loaded.has(id)) return this.pub;
    if (this.gm?.loaded.has(id)) return this.gm;
    return null;
  }

  private transact(part: DocPart, fn: () => void) {
    part.doc.transact(fn, this);
  }

  /**
   * Ogni chiamata pubblica è un'azione dell'utente: diventa un solo passo di annulla, anche se
   * tocca entrambi i documenti o arriva subito dopo un'altra.
   */
  private action(fn: () => void) {
    const managers = [this.pub.undo, ...(this.gm ? [this.gm.undo] : [])];
    for (const manager of managers) manager.stopCapturing();
    const before = managers.map((m) => m.undoStack.length);
    fn();
    const touched = managers.filter((m, i) => m.undoStack.length > (before[i] as number));
    if (touched.length > 0) {
      this.history.push(touched);
      this.future = [];
      // Yjs svuota il redo solo dei documenti toccati: lo si allinea anche per gli altri.
      for (const manager of managers) manager.clear(false, true);
      this.emit();
    }
  }

  add(items: BoardItem[], options: { hidden?: boolean } = {}) {
    const part = options.hidden && this.gm ? this.gm : this.pub;
    this.action(() =>
      this.transact(part, () => {
        for (const item of items) part.items.set(item.id, item);
      }),
    );
  }

  update(patches: Record<string, ItemPatch>) {
    this.action(() => {
      for (const part of [this.pub, this.gm]) {
        if (!part) continue;
        const entries = Object.entries(patches).filter(([id]) => this.partOf(id) === part);
        if (entries.length === 0) continue;
        this.transact(part, () => {
          for (const [id, patch] of entries) {
            const current = part.loaded.get(id);
            if (current) part.items.set(id, { ...current, ...patch, id, kind: current.kind });
          }
        });
      }
    });
  }

  remove(ids: Iterable<string>) {
    const list = [...ids];
    this.action(() => {
      for (const part of [this.pub, this.gm]) {
        if (!part || !list.some((id) => part.items.has(id))) continue;
        this.transact(part, () => {
          for (const id of list) part.items.delete(id);
        });
      }
    });
  }

  /** Sposta gli oggetti nel documento del GM (nascosti) o in quello pubblico (rivelati). */
  setHidden(ids: string[], hidden: boolean) {
    const gm = this.gm;
    if (!gm) return;
    const [from, to] = hidden ? [this.pub, gm] : [gm, this.pub];
    const moving = ids
      .map((id) => from.loaded.get(id))
      .filter((i): i is BoardItem => i !== undefined);
    if (moving.length === 0) return;
    this.action(() => {
      // Prima si aggiunge alla destinazione, così l'oggetto non sparisce nemmeno per un frame.
      this.transact(to, () => {
        for (const item of moving) to.items.set(item.id, item);
      });
      this.transact(from, () => {
        for (const item of moving) from.items.delete(item.id);
      });
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
    const patches: Record<string, ItemPatch> = {};
    for (const item of items) {
      const z = nextZ(item);
      patches[item.id] = { z };
      // topZ/bottomZ devono vedere gli z già assegnati in questo giro.
      this.byId.set(item.id, { ...item, z });
    }
    this.update(patches);
  }

  updateGrid(patch: Partial<GridSettings>) {
    const next = { ...this.grid, ...patch };
    if (!gridSettingsSchema.safeParse(next).success) return;
    this.action(() => this.transact(this.pub, () => this.settings.set("grid", next)));
  }

  addFog(op: Omit<FogOp, "id" | "seq">) {
    // seq crescente anche tra client diversi: l'orologio basta, il contatore separa i pari merito.
    const full: FogOp = { ...op, id: newItemId(), seq: Date.now() + (this.seq++ % 1000) / 1000 };
    if (!fogOpSchema.safeParse(full).success) return;
    this.action(() => this.transact(this.pub, () => this.fogMap.set(full.id, full)));
  }

  clearFog() {
    if (this.fogMap.size === 0) return;
    this.action(() =>
      this.transact(this.pub, () => {
        for (const key of [...this.fogMap.keys()]) this.fogMap.delete(key);
      }),
    );
  }

  undo() {
    const entry = this.history.pop();
    if (!entry) return;
    for (const manager of entry) manager.undo();
    this.future.push(entry);
    this.emit();
  }

  redo() {
    const entry = this.future.pop();
    if (!entry) return;
    for (const manager of entry) manager.redo();
    this.history.push(entry);
    this.emit();
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  destroy() {
    this.pub.undo.destroy();
    this.gm?.undo.destroy();
    this.listeners.clear();
  }
}

/** Id casuale; non usa crypto.randomUUID, disponibile solo in contesti sicuri (HTTPS/localhost). */
export function newItemId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
