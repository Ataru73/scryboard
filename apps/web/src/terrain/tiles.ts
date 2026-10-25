import type { TerrainOp } from "@scryboard/shared";
import { boxesIntersect } from "../board/geometry";
import type { Box } from "../board/viewport";
import { terrainOpBounds } from "./geometry";
import { drawTerrainOp } from "./render";

/** Lato di un tassello in pixel del canvas. */
export const TILE_PX = 512;
const MAX_TILES = 96;

/**
 * Risoluzione dei tasselli (pixel del canvas per pixel del mondo) per uno zoom: potenze di due,
 * arrotondate per eccesso per restare nitidi, da 1/32 a 2.
 */
export function tileResolution(scale: number): number {
  return 2 ** Math.min(1, Math.max(-5, Math.ceil(Math.log2(scale))));
}

export function tileBox(resolution: number, tx: number, ty: number): Box {
  const size = TILE_PX / resolution;
  return { x: tx * size, y: ty * size, width: size, height: size };
}

/** Coordinate dei tasselli che coprono il riquadro visibile. */
export function visibleTileCoords(visible: Box, resolution: number): [number, number][] {
  const size = TILE_PX / resolution;
  const coords: [number, number][] = [];
  for (let ty = Math.floor(visible.y / size); ty * size < visible.y + visible.height; ty++) {
    for (let tx = Math.floor(visible.x / size); tx * size < visible.x + visible.width; tx++) {
      coords.push([tx, ty]);
    }
  }
  return coords;
}

export interface TileState {
  /** Operazioni già disegnate nel tassello. */
  drawn: Set<string>;
  /** seq più alto disegnato: le operazioni nuove si possono aggiungere sopra solo se lo superano. */
  lastSeq: number;
}

export type TileUpdate =
  | { kind: "none" }
  | { kind: "clear" }
  | { kind: "full"; ops: TerrainOp[] }
  | { kind: "incremental"; ops: TerrainOp[] };

/**
 * Cosa fare su un tassello quando cambiano le operazioni (ordinate per seq). Il caso comune,
 * una pennellata nuova, si aggiunge sopra senza ridisegnare; un annulla o un'operazione arrivata
 * fuori ordine richiede di ridisegnare il tassello da capo.
 */
export function planTileUpdate(
  state: TileState | undefined,
  ops: TerrainOp[],
  bounds: (op: TerrainOp) => Box,
  box: Box,
): TileUpdate {
  const relevant = ops.filter((op) => boxesIntersect(bounds(op), box));
  if (relevant.length === 0)
    return state && state.drawn.size > 0 ? { kind: "clear" } : { kind: "none" };
  if (!state || state.drawn.size === 0) return { kind: "full", ops: relevant };
  const ids = new Set(relevant.map((op) => op.id));
  for (const id of state.drawn) if (!ids.has(id)) return { kind: "full", ops: relevant };
  const added = relevant.filter((op) => !state.drawn.has(op.id));
  if (added.length === 0) return { kind: "none" };
  if (added.some((op) => op.seq < state.lastSeq)) return { kind: "full", ops: relevant };
  return { kind: "incremental", ops: added };
}

export interface TileView {
  key: string;
  canvas: HTMLCanvasElement;
  box: Box;
  /** Cambia a ogni ridisegno, per far ridisegnare a Konva il nodo dell'immagine. */
  version: number;
}

/** Ridisegno completo in corso: si disegna su un canvas nuovo e lo si mostra solo alla fine. */
interface Job {
  ops: TerrainOp[];
  index: number;
  canvas: HTMLCanvasElement;
  /** Firma delle operazioni del lavoro, per riconoscere quando ricominciarlo. */
  signature: string;
}

interface Tile extends TileState {
  /** Contenuto pronto da mostrare (null finché il primo disegno non è finito). */
  canvas: HTMLCanvasElement | null;
  box: Box;
  resolution: number;
  version: number;
  lastUsed: number;
  job: Job | null;
}

function newCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_PX;
  canvas.height = TILE_PX;
  return canvas;
}

function prepare(canvas: HTMLCanvasElement, tile: Tile): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const r = tile.resolution;
  ctx.setTransform(r, 0, 0, r, -tile.box.x * r, -tile.box.y * r);
  return ctx;
}

/**
 * Tasselli del terreno con cache. Una pennellata nuova si aggiunge subito sopra al tassello; i
 * ridisegni completi (primo caricamento, cambio di zoom, annulla) si fanno a piccoli blocchi
 * con `pump`, senza bloccare la pagina. Nel frattempo si mostrano i tasselli di un altro livello
 * di zoom che coprono la stessa zona.
 */
export class TerrainTiles {
  private readonly tiles = new Map<string, Tile>();
  private readonly boundsCache = new Map<string, Box>();
  private visibleKeys: string[] = [];
  private clock = 0;

  private bounds = (op: TerrainOp): Box => {
    let b = this.boundsCache.get(op.id);
    if (!b) {
      b = terrainOpBounds(op);
      this.boundsCache.set(op.id, b);
    }
    return b;
  };

  /** Allinea i tasselli visibili alle operazioni correnti (senza ridisegni lunghi). */
  update(ops: TerrainOp[], visible: Box, scale: number): void {
    const resolution = tileResolution(scale);
    const now = ++this.clock;
    this.visibleKeys = [];
    for (const [tx, ty] of visibleTileCoords(visible, resolution)) {
      const key = `${resolution}:${tx}:${ty}`;
      const box = tileBox(resolution, tx, ty);
      let tile = this.tiles.get(key);
      if (tile?.job) {
        // C'è già un ridisegno: lo si ricomincia solo se le operazioni sono cambiate.
        const relevant = ops.filter((op) => boxesIntersect(this.bounds(op), box));
        const signature = relevant.map((op) => op.id).join(",");
        if (signature !== tile.job.signature) {
          tile.job =
            relevant.length > 0
              ? { ops: relevant, index: 0, canvas: newCanvas(), signature }
              : null;
          if (relevant.length === 0) this.clear(tile);
        }
      } else {
        const plan = planTileUpdate(tile?.canvas ? tile : undefined, ops, this.bounds, box);
        if (plan.kind === "full") {
          tile ??= this.create(key, box, resolution, now);
          tile.job = {
            ops: plan.ops,
            index: 0,
            canvas: newCanvas(),
            signature: plan.ops.map((op) => op.id).join(","),
          };
        } else if (plan.kind === "incremental" && tile?.canvas) {
          const ctx = prepare(tile.canvas, tile);
          for (const op of plan.ops) {
            drawTerrainOp(ctx, op);
            tile.drawn.add(op.id);
            tile.lastSeq = Math.max(tile.lastSeq, op.seq);
          }
          tile.version++;
        } else if (plan.kind === "clear" && tile) {
          this.clear(tile);
        }
      }
      if (tile) tile.lastUsed = now;
      this.visibleKeys.push(key);
    }
    this.evict(now);
  }

  private create(key: string, box: Box, resolution: number, now: number): Tile {
    const tile: Tile = {
      canvas: null,
      box,
      resolution,
      drawn: new Set(),
      lastSeq: -Infinity,
      version: 0,
      lastUsed: now,
      job: null,
    };
    this.tiles.set(key, tile);
    return tile;
  }

  private clear(tile: Tile) {
    tile.canvas = null;
    tile.drawn = new Set();
    tile.lastSeq = -Infinity;
    tile.version++;
  }

  get pending(): boolean {
    return this.visibleKeys.some((key) => this.tiles.get(key)?.job);
  }

  /** Porta avanti i ridisegni dei tasselli visibili fino a `budgetMs`. Dice se è cambiato qualcosa. */
  pump(budgetMs: number): boolean {
    const deadline = performance.now() + budgetMs;
    let changed = false;
    for (const key of this.visibleKeys) {
      const tile = this.tiles.get(key);
      const job = tile?.job;
      if (!tile || !job) continue;
      const ctx = prepare(job.canvas, tile);
      const before = job.index;
      while (job.index < job.ops.length && performance.now() < deadline) {
        drawTerrainOp(ctx, job.ops[job.index] as TerrainOp);
        job.index++;
      }
      // Un tassello ancora vuoto mostra il disegno mentre procede.
      if (!tile.canvas && job.index > before) {
        tile.version++;
        changed = true;
      }
      if (job.index === job.ops.length) {
        tile.canvas = job.canvas;
        tile.drawn = new Set(job.ops.map((op) => op.id));
        tile.lastSeq = Math.max(...job.ops.map((op) => op.seq));
        tile.job = null;
        tile.version++;
        changed = true;
      }
      if (performance.now() >= deadline) break;
    }
    return changed;
  }

  /**
   * Tasselli da mostrare: quelli pronti al livello di zoom attuale e, dove mancano, quelli di
   * altri livelli che coprono la stessa zona (disegnati sotto).
   */
  views(): TileView[] {
    const current: TileView[] = [];
    const fallback = new Map<string, TileView>();
    for (const key of this.visibleKeys) {
      const tile = this.tiles.get(key);
      if (tile?.canvas) {
        current.push({ key, canvas: tile.canvas, box: tile.box, version: tile.version });
        continue;
      }
      if (tile?.job && tile.job.index > 0) {
        // Primo disegno in corso: si mostra parziale, sopra i tasselli di riserva.
        current.push({
          key,
          canvas: tile.job.canvas,
          box: tile.box,
          version: tile.version,
        });
      }
      if (!tile?.job) continue;
      for (const [otherKey, other] of this.tiles) {
        if (other.resolution === tile.resolution || !other.canvas) continue;
        if (boxesIntersect(other.box, tile.box)) {
          fallback.set(otherKey, {
            key: otherKey,
            canvas: other.canvas,
            box: other.box,
            version: other.version,
          });
        }
      }
    }
    return [...fallback.values(), ...current];
  }

  /** Libera i tasselli usati meno di recente (non quelli visibili ora). */
  private evict(now: number) {
    if (this.tiles.size <= MAX_TILES) return;
    const old = [...this.tiles.entries()]
      .filter(([, t]) => t.lastUsed < now)
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [key] of old.slice(0, this.tiles.size - MAX_TILES)) this.tiles.delete(key);
  }
}
