import {
  type BoardItem,
  boardItemSchema,
  compareItems,
  DEFAULT_GRID,
  DEFAULT_LIGHTING,
  FOG_MAP,
  type FogOp,
  fogOpSchema,
  type GridSettings,
  gridSettingsSchema,
  ITEMS_MAP,
  type Layer,
  type LightingSettings,
  lightingSettingsSchema,
  SETTINGS_MAP,
  TERRAIN_MAP,
  type TerrainOp,
  terrainOpSchema,
  WALLS_MAP,
  type Wall,
  type WallDraft,
  wallSchema,
} from "@scryboard/shared";
import * as Y from "yjs";

/** Modifica parziale di un oggetto: non si può cambiare tipo né id. */
export type ItemPatch = Partial<Omit<BoardItem, "id" | "kind">> & Record<string, unknown>;
/** Modifica di un muro: il tipo non cambia; lo stato porta esiste solo sulle porte. */
export type WallPatch = { points?: number[]; door?: "open" | "closed" | "locked" };

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
  private readonly terrainMap: Y.Map<unknown>;
  private readonly wallsMap: Y.Map<unknown>;
  private grid: GridSettings = DEFAULT_GRID;
  private lighting: LightingSettings = DEFAULT_LIGHTING;
  private fog: FogOp[] = [];
  private terrain: TerrainOp[] = [];
  private walls: Wall[] = [];
  private readonly wallsById = new Map<string, Wall>();
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
    this.terrainMap = publicDoc.getMap(TERRAIN_MAP);
    this.wallsMap = publicDoc.getMap(WALLS_MAP);
    this.pub = this.part(publicDoc, [this.settings, this.fogMap, this.terrainMap, this.wallsMap]);
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
    this.loadTerrain();
    this.terrainMap.observe(() => {
      this.loadTerrain();
      this.emit();
    });
    this.loadWalls();
    this.wallsMap.observe(() => {
      this.loadWalls();
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
    const lighting = lightingSettingsSchema.safeParse(this.settings.get("lighting"));
    const next = lighting.success ? lighting.data : DEFAULT_LIGHTING;
    // Stesso oggetto se non cambia nulla: lo snapshot per React resta stabile.
    if (JSON.stringify(next) !== JSON.stringify(this.lighting)) this.lighting = next;
  }

  private loadFog() {
    const ops: FogOp[] = [];
    for (const value of this.fogMap.values()) {
      const parsed = fogOpSchema.safeParse(value);
      if (parsed.success) ops.push(parsed.data);
    }
    this.fog = ops.sort((a, b) => a.seq - b.seq || (a.id < b.id ? -1 : 1));
  }

  private loadTerrain() {
    const ops: TerrainOp[] = [];
    for (const value of this.terrainMap.values()) {
      const parsed = terrainOpSchema.safeParse(value);
      if (parsed.success) ops.push(parsed.data);
    }
    this.terrain = ops.sort((a, b) => a.seq - b.seq || (a.id < b.id ? -1 : 1));
  }

  private loadWalls() {
    const walls: Wall[] = [];
    this.wallsById.clear();
    for (const [key, value] of this.wallsMap.entries()) {
      const parsed = wallSchema.safeParse(value);
      if (!parsed.success || parsed.data.id !== key) continue;
      walls.push(parsed.data);
      this.wallsById.set(key, parsed.data);
    }
    this.walls = walls.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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
  getLighting = (): LightingSettings => this.lighting;
  getFog = (): FogOp[] => this.fog;
  getTerrain = (): TerrainOp[] => this.terrain;
  getWalls = (): Wall[] => this.walls;

  getWall(id: string): Wall | undefined {
    return this.wallsById.get(id);
  }

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

  updateLighting(patch: Partial<LightingSettings>) {
    const next = { ...this.lighting, ...patch };
    if (!lightingSettingsSchema.safeParse(next).success) return;
    this.action(() => this.transact(this.pub, () => this.settings.set("lighting", next)));
  }

  updateGrid(patch: Partial<GridSettings>) {
    const next = { ...this.grid, ...patch };
    if (!gridSettingsSchema.safeParse(next).success) return;
    this.action(() => this.transact(this.pub, () => this.settings.set("grid", next)));
  }

  /** seq crescente anche tra client diversi: l'orologio basta, il contatore separa i pari merito. */
  private nextSeq(): number {
    return Date.now() + (this.seq++ % 1000) / 1000;
  }

  addTerrain(op: Omit<TerrainOp, "id" | "seq">) {
    this.addTerrainBatch([op]);
  }

  /**
   * Più operazioni di terreno (e di nebbia) come un'unica azione: un incolla, oppure una
   * pennellata con la nebbia che la copre ("pittura nascosta").
   */
  addTerrainBatch(ops: Omit<TerrainOp, "id" | "seq">[], fog: Omit<FogOp, "id" | "seq">[] = []) {
    const terrain = ops
      .map((op) => ({ ...op, id: newItemId(), seq: this.nextSeq() }) as TerrainOp)
      .filter((op) => terrainOpSchema.safeParse(op).success);
    const fogOps = fog
      .map((op) => ({ ...op, id: newItemId(), seq: this.nextSeq() }) as FogOp)
      .filter((op) => fogOpSchema.safeParse(op).success);
    if (terrain.length === 0 && fogOps.length === 0) return;
    this.action(() =>
      this.transact(this.pub, () => {
        for (const op of terrain) this.terrainMap.set(op.id, op);
        for (const op of fogOps) this.fogMap.set(op.id, op);
      }),
    );
  }

  clearTerrain() {
    if (this.terrainMap.size === 0) return;
    this.action(() =>
      this.transact(this.pub, () => {
        for (const key of [...this.terrainMap.keys()]) this.terrainMap.delete(key);
      }),
    );
  }

  /** Aggiunge muri o tutti i contorni generati come una sola azione di annulla. */
  addWalls(drafts: WallDraft[]): Wall[] {
    const full = drafts.map((draft) => ({ ...draft, id: newItemId() }) as Wall);
    const valid = full.filter((wall) => wallSchema.safeParse(wall).success);
    if (valid.length === 0) return [];
    this.action(() =>
      this.transact(this.pub, () => {
        for (const wall of valid) this.wallsMap.set(wall.id, wall);
      }),
    );
    return valid;
  }

  addWall(draft: WallDraft): Wall | undefined {
    return this.addWalls([draft])[0];
  }

  updateWall(id: string, patch: WallPatch) {
    const current = this.wallsById.get(id);
    if (!current || (current.kind !== "door" && patch.door !== undefined)) return;
    const next = { ...current, ...patch, id } as Wall;
    if (!wallSchema.safeParse(next).success) return;
    this.action(() => this.transact(this.pub, () => this.wallsMap.set(id, next)));
  }

  removeWalls(ids: Iterable<string>) {
    const list = [...ids].filter((id) => this.wallsMap.has(id));
    if (list.length === 0) return;
    this.action(() =>
      this.transact(this.pub, () => {
        for (const id of list) this.wallsMap.delete(id);
      }),
    );
  }

  clearWalls() {
    this.removeWalls([...this.wallsMap.keys()]);
  }

  addFog(op: Omit<FogOp, "id" | "seq">) {
    const full: FogOp = { ...op, id: newItemId(), seq: this.nextSeq() };
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
