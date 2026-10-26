import {
  type BoardItem,
  boardItemSchema,
  compareItems,
  DEFAULT_GRID,
  DEFAULT_LIGHTING,
  DEFAULT_TURN,
  FOG_MAP,
  type FogOp,
  fogOpSchema,
  type GridSettings,
  gridSettingsSchema,
  type Handout,
  handoutSchema,
  type ImageItem,
  ITEMS_MAP,
  initiativeOrder,
  type Layer,
  type LightingSettings,
  lightingSettingsSchema,
  MASKS_MAP,
  OBSCURED_IDENTITY,
  SETTINGS_MAP,
  type Summon,
  stepTurn,
  summonSchema,
  TERRAIN_MAP,
  type TerrainOp,
  TOKEN_IDENTITY_KEYS,
  type TokenIdentity,
  type TokenItem,
  type TurnSettings,
  terrainOpSchema,
  tokenIdentitySchema,
  turnSettingsSchema,
  WALLS_MAP,
  type Wall,
  type WallDraft,
  wallSchema,
} from "@scryboard/shared";
import * as Y from "yjs";
import { transformPointsWithImage } from "../walls/fromImage";
import { duplicateTokenName } from "./grid";

/** Modifica parziale di un oggetto: non si può cambiare tipo né id. */
export type ItemPatch = Partial<Omit<BoardItem, "id" | "kind">> & Record<string, unknown>;
/** Modifica di un muro: il tipo non cambia; lo stato porta esiste solo sulle porte. */
export type WallPatch = {
  points?: number[];
  door?: "open" | "closed" | "locked";
  secret?: boolean;
  attachedTo?: string | null;
};

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
  /** Identità vera dei token in incognito: sta nel documento del GM. */
  private readonly masks: Y.Map<unknown> | null;
  private readonly settings: Y.Map<unknown>;
  private readonly fogMap: Y.Map<unknown>;
  private readonly terrainMap: Y.Map<unknown>;
  private readonly wallsMap: Y.Map<unknown>;
  private grid: GridSettings = DEFAULT_GRID;
  private lighting: LightingSettings = DEFAULT_LIGHTING;
  private turn: TurnSettings = DEFAULT_TURN;
  private summonState: Summon | null = null;
  private handoutState: Handout | null = null;
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
    this.masks = gmDoc ? gmDoc.getMap(MASKS_MAP) : null;
    this.gm = gmDoc && this.masks ? this.part(gmDoc, [this.masks]) : null;
    this.masks?.observe(() => this.rebuild());

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
    const turn = turnSettingsSchema.safeParse(this.settings.get("turn"));
    const nextTurn = turn.success ? turn.data : DEFAULT_TURN;
    if (JSON.stringify(nextTurn) !== JSON.stringify(this.turn)) this.turn = nextTurn;
    const summon = summonSchema.safeParse(this.settings.get("summon"));
    const nextSummon = summon.success ? summon.data : null;
    if (JSON.stringify(nextSummon) !== JSON.stringify(this.summonState))
      this.summonState = nextSummon;
    const handout = handoutSchema.safeParse(this.settings.get("handout"));
    const nextHandout = handout.success ? handout.data : null;
    if (JSON.stringify(nextHandout) !== JSON.stringify(this.handoutState))
      this.handoutState = nextHandout;
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
    // Il GM vede i token in incognito con il loro aspetto vero.
    for (const [id, item] of this.byId) {
      if (item.kind !== "token" || !item.obscured) continue;
      const identity = this.maskOf(id);
      if (identity) this.byId.set(id, { ...item, ...identity });
    }
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
  getTurn = (): TurnSettings => this.turn;
  getSummon = (): Summon | null => this.summonState;
  getHandout = (): Handout | null => this.handoutState;

  /**
   * Mostra un'immagine a tutto schermo ai giocatori, o smette di mostrarla (`null`). Come il
   * richiamo, solo il GM può farlo e non entra nello storico.
   */
  showHandout(assetId: string | null) {
    const next: Handout | null = assetId ? { id: newItemId(), assetId } : null;
    if (next && !handoutSchema.safeParse(next).success) return;
    this.pub.doc.transact(() => this.settings.set("handout", next), "handout");
  }

  /**
   * Porta i giocatori su un punto (solo il GM può scrivere le impostazioni). Non entra nello
   * storico: annullare un'azione non deve richiamare di nuovo i giocatori.
   */
  summon(point: { x: number; y: number }, scale: number) {
    const next: Summon = { id: newItemId(), x: point.x, y: point.y, scale };
    if (!summonSchema.safeParse(next).success) return;
    this.pub.doc.transact(() => this.settings.set("summon", next), "summon");
  }
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

  /** In incognito: i giocatori vedono una sagoma senza nome. */
  isObscured(id: string): boolean {
    const item = this.byId.get(id);
    return item?.kind === "token" && !!item.obscured;
  }

  private maskOf(id: string): TokenIdentity | null {
    const parsed = tokenIdentitySchema.safeParse(this.masks?.get(id));
    return parsed.success ? parsed.data : null;
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
    // Nome e aspetto di un token in incognito si cambiano nella sua maschera, non nel documento.
    const masked = new Map<string, TokenIdentity>();
    const masks = this.masks;
    if (masks) {
      patches = { ...patches };
      for (const [id, patch] of Object.entries(patches)) {
        const current = this.byId.get(id);
        if (current?.kind !== "token" || !current.obscured) continue;
        const rest: ItemPatch = { ...patch };
        const identity: Record<string, unknown> = {};
        for (const key of TOKEN_IDENTITY_KEYS) {
          if (!(key in rest)) continue;
          identity[key] = rest[key];
          delete rest[key];
        }
        if (Object.keys(identity).length === 0) continue;
        const next = tokenIdentitySchema.safeParse({ ...identityOf(current), ...identity });
        if (next.success) masked.set(id, next.data);
        patches[id] = rest;
      }
    }
    this.action(() => {
      if (masks && this.gm && masked.size > 0) {
        this.transact(this.gm, () => {
          for (const [id, identity] of masked) masks.set(id, identity);
        });
      }
      for (const part of [this.pub, this.gm]) {
        if (!part) continue;
        const entries = Object.entries(patches).filter(([id]) => this.partOf(id) === part);
        if (entries.length === 0) continue;
        this.transact(part, () => {
          for (const [id, patch] of entries) {
            const current = part.loaded.get(id);
            if (current) {
              const next = { ...current, ...patch, id, kind: current.kind };
              part.items.set(id, next);
              if (current.kind === "image") {
                this.updateAttachedWalls(current, next as ImageItem);
              }
            }
          }
        });
      }
    });
  }

  private updateAttachedWalls(oldImage: ImageItem, nextImage: ImageItem) {
    if (
      oldImage.x === nextImage.x &&
      oldImage.y === nextImage.y &&
      oldImage.width === nextImage.width &&
      oldImage.height === nextImage.height &&
      oldImage.rotation === nextImage.rotation
    ) {
      return;
    }
    const attached = this.walls.filter((w) => w.attachedTo === oldImage.id);
    if (attached.length === 0) return;
    this.transact(this.pub, () => {
      for (const wall of attached) {
        const points = transformPointsWithImage(wall.points, oldImage, nextImage);
        const nextWall = { ...wall, points };
        this.wallsMap.set(wall.id, nextWall);
      }
    });
  }

  remove(ids: Iterable<string>) {
    const list = [...ids];
    const removed = new Set(list);
    // I token agganciati a uno che sparisce si sganciano, nella stessa azione (annullando tornano).
    const orphans = [...this.byId.values()].filter(
      (i): i is TokenItem =>
        i.kind === "token" && !!i.attachedTo && removed.has(i.attachedTo) && !removed.has(i.id),
    );
    const deadWalls = this.walls.filter((w) => !!w.attachedTo && removed.has(w.attachedTo));
    const masks = this.masks;
    const deadMasks = list.filter((id) => masks?.has(id));
    this.action(() => {
      if (masks && this.gm && deadMasks.length > 0) {
        this.transact(this.gm, () => {
          for (const id of deadMasks) masks.delete(id);
        });
      }
      if (deadWalls.length > 0) {
        this.transact(this.pub, () => {
          for (const w of deadWalls) this.wallsMap.delete(w.id);
        });
      }
      for (const part of [this.pub, this.gm]) {
        if (!part) continue;
        const mine = orphans.filter((o) => part.loaded.has(o.id));
        if (mine.length === 0 && !list.some((id) => part.items.has(id))) continue;
        this.transact(part, () => {
          for (const id of list) part.items.delete(id);
          for (const o of mine) part.items.set(o.id, { ...o, attachedTo: null });
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

  /**
   * Mette i token in incognito, spostando nome e aspetto nel documento del GM, o li svela
   * riportandoli sul token.
   */
  setObscured(ids: string[], obscured: boolean) {
    const gm = this.gm;
    const masks = this.masks;
    if (!gm || !masks) return;
    const tokens = ids
      .map((id) => this.byId.get(id))
      .filter((i): i is TokenItem => i?.kind === "token" && !!i.obscured !== obscured);
    if (tokens.length === 0) return;
    const write = (fn: (part: DocPart, token: TokenItem) => void) => {
      for (const part of [this.pub, gm]) {
        const mine = tokens.filter((t) => part.loaded.has(t.id));
        if (mine.length === 0) continue;
        this.transact(part, () => {
          for (const token of mine) fn(part, token);
        });
      }
    };
    this.action(() => {
      if (obscured) {
        // Prima la maschera, poi si cancella l'identità dal token: non si perde nulla.
        this.transact(gm, () => {
          for (const token of tokens) masks.set(token.id, identityOf(token));
        });
        write((part, token) =>
          part.items.set(token.id, { ...token, ...OBSCURED_IDENTITY, obscured: true }),
        );
      } else {
        write((part, token) => {
          const { obscured: _, ...revealed } = token;
          part.items.set(token.id, revealed);
        });
        this.transact(gm, () => {
          for (const token of tokens) masks.delete(token.id);
        });
      }
    });
  }

  /**
   * Copia gli oggetti una casella più in basso a destra, sopra agli altri e nello stesso
   * documento (la copia di un oggetto nascosto resta nascosta, quella di un token in incognito
   * resta in incognito). Le copie dei token prendono il primo nome numerato libero e restano
   * fuori dall'ordine dei turni e dagli agganci; `asPlayer` lascia fuori ciò che un giocatore
   * non può creare. Restituisce gli id delle copie.
   */
  duplicate(ids: string[], options: { asPlayer?: boolean } = {}): string[] {
    const step = this.grid.size;
    const names = this.sorted.flatMap((i) => (i.kind === "token" ? [i.name] : []));
    const nextZ = new Map<Layer, number>();
    const copies: { part: DocPart; item: BoardItem; mask: TokenIdentity | null }[] = [];
    // In ordine di z, così le copie restano una sopra l'altra come gli originali.
    const originals = ids
      .map((id) => this.byId.get(id))
      .filter((i): i is BoardItem => i !== undefined)
      .sort(compareItems);
    for (const shown of originals) {
      const part = this.partOf(shown.id);
      const raw = part?.loaded.get(shown.id);
      if (!part || !raw) continue;
      if (options.asPlayer && raw.kind === "token" && raw.obscured) continue;
      const z = nextZ.get(raw.layer) ?? this.topZ(raw.layer);
      nextZ.set(raw.layer, z + 1);
      const moved = { id: newItemId(), x: raw.x + step, y: raw.y + step, z };
      if (raw.kind !== "token" || shown.kind !== "token") {
        copies.push({ part, item: { ...raw, ...moved }, mask: null });
        continue;
      }
      const { initiative: _, attachedTo: __, ...token } = raw;
      const { vision: ___, light: ____, owners: _____, ...playerToken } = token;
      const name = duplicateTokenName(shown.name, names);
      names.push(name);
      const item: TokenItem = { ...(options.asPlayer ? playerToken : token), ...moved };
      if (item.obscured) copies.push({ part, item, mask: { ...identityOf(shown), name } });
      else copies.push({ part, item: { ...item, name }, mask: null });
    }
    if (copies.length === 0) return [];
    const masks = this.masks;
    this.action(() => {
      // Prima le maschere (documento del GM), poi i token che le usano.
      const masked = copies.filter((c) => c.mask);
      if (masks && this.gm && masked.length > 0) {
        this.transact(this.gm, () => {
          for (const { item, mask } of masked) masks.set(item.id, mask);
        });
      }
      for (const part of [this.pub, this.gm]) {
        if (!part) continue;
        const mine = copies.filter((c) => c.part === part);
        if (mine.length === 0) continue;
        this.transact(part, () => {
          for (const { item } of mine) part.items.set(item.id, item);
        });
      }
    });
    return copies.map((c) => c.item.id);
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

  /** Token nell'ordine dei turni (anche quelli nascosti, se questo store è del GM). */
  getInitiativeOrder(): TokenItem[] {
    return initiativeOrder(this.sorted.filter((i): i is TokenItem => i.kind === "token"));
  }

  /** Mette i token nell'ordine dei turni con questo valore, o li toglie (`null`). */
  setInitiative(ids: string[], value: number | null) {
    const patches: Record<string, ItemPatch> = {};
    for (const id of ids)
      if (this.byId.get(id)?.kind === "token") patches[id] = { initiative: value };
    if (Object.keys(patches).length > 0) this.update(patches);
  }

  /** Passa al token successivo (o precedente) dell'ordine. */
  advanceTurn(direction: 1 | -1 = 1) {
    this.setTurn(stepTurn(this.getInitiativeOrder(), this.turn, direction));
  }

  /** Riporta i turni all'inizio, lasciando l'ordine com'è. */
  resetTurn() {
    this.setTurn(DEFAULT_TURN);
  }

  private setTurn(next: TurnSettings) {
    if (!turnSettingsSchema.safeParse(next).success) return;
    this.action(() => this.transact(this.pub, () => this.settings.set("turn", next)));
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
    if (
      !current ||
      (current.kind !== "door" && (patch.door !== undefined || patch.secret !== undefined))
    ) {
      return;
    }
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

  isEmpty(): boolean {
    return (
      this.byId.size === 0 &&
      this.terrainMap.size === 0 &&
      this.wallsMap.size === 0 &&
      this.fogMap.size === 0
    );
  }

  /** Svuota l'intera lavagna (oggetti pubblici e nascosti, terreno, muri e nebbia) in un solo passo di annulla. */
  clearBoard() {
    if (this.isEmpty()) return;
    this.action(() => {
      if (
        this.pub.items.size > 0 ||
        this.terrainMap.size > 0 ||
        this.wallsMap.size > 0 ||
        this.fogMap.size > 0
      ) {
        this.transact(this.pub, () => {
          for (const key of [...this.pub.items.keys()]) this.pub.items.delete(key);
          for (const key of [...this.terrainMap.keys()]) this.terrainMap.delete(key);
          for (const key of [...this.wallsMap.keys()]) this.wallsMap.delete(key);
          for (const key of [...this.fogMap.keys()]) this.fogMap.delete(key);
        });
      }
      const masks = this.masks;
      if (this.gm && (this.gm.items.size > 0 || (masks?.size ?? 0) > 0)) {
        const gm = this.gm;
        this.transact(gm, () => {
          for (const key of [...gm.items.keys()]) gm.items.delete(key);
          for (const key of [...(masks?.keys() ?? [])]) masks?.delete(key);
        });
      }
    });
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

function identityOf(token: TokenItem): TokenIdentity {
  return {
    name: token.name,
    color: token.color,
    assetId: token.assetId,
    portrait: token.portrait ?? null,
  };
}

/** Id casuale; non usa crypto.randomUUID, disponibile solo in contesti sicuri (HTTPS/localhost). */
export function newItemId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
