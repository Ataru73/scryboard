import type { DiagonalRule, GridSettings, TokenItem } from "@scryboard/shared";
import { i18n } from "../i18n";
import { snapTokenCenter } from "./grid";
import { isHex, pixelToHex } from "./hex";
import type { Point } from "./viewport";

/** Distanza in caselle tra due caselle quadrate che distano `dx` colonne e `dy` righe. */
export function squareDistance(dx: number, dy: number, rule: DiagonalRule): number {
  const major = Math.max(Math.abs(dx), Math.abs(dy));
  const minor = Math.min(Math.abs(dx), Math.abs(dy));
  if (rule === "euclid") return Math.hypot(dx, dy);
  if (rule === "alternate") return major + Math.floor(minor / 2);
  return major;
}

/** Distanza in caselle tra due punti: sulla griglia si contano le caselle, altrimenti i pixel. */
export function segmentCells(a: Point, b: Point, grid: GridSettings): number {
  if (!grid.enabled) return Math.hypot(b.x - a.x, b.y - a.y) / grid.size;
  if (isHex(grid)) {
    const ha = pixelToHex(a, grid);
    const hb = pixelToHex(b, grid);
    const dq = hb.q - ha.q;
    const dr = hb.r - ha.r;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
  }
  const cell = (v: number, offset: number) => Math.floor((v - offset) / grid.size);
  return squareDistance(
    cell(b.x, grid.offsetX) - cell(a.x, grid.offsetX),
    cell(b.y, grid.offsetY) - cell(a.y, grid.offsetY),
    grid.diagonals,
  );
}

/** Lunghezza in caselle di un percorso a tappe. */
export function pathCells(points: Point[], grid: GridSettings): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += segmentCells(points[i - 1] as Point, points[i] as Point, grid);
  }
  return total;
}

/**
 * Distanza con un dislivello di `rise` caselle: sulla griglia quadrata la verticale si conta come
 * un'altra direzione (con la stessa regola delle diagonali), altrimenti in linea retta.
 */
export function withRise(cells: number, rise: number, grid: GridSettings): number {
  if (rise === 0) return cells;
  if (grid.enabled && !isHex(grid)) return squareDistance(cells, rise, grid.diagonals);
  return Math.hypot(cells, rise);
}

/** Quota del punto: quella del token più in alto che lo copre, altrimenti il terreno (0). */
export function elevationAt(p: Point, tokens: TokenItem[], grid: GridSettings): number {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i] as TokenItem;
    const r = (token.size * grid.size) / 2;
    if (Math.hypot(p.x - token.x, p.y - token.y) <= r) return token.elevation ?? 0;
  }
  return 0;
}

/** Dislivello in caselle tra il primo e l'ultimo punto di una misura. */
export function measureRise(points: Point[], tokens: TokenItem[], grid: GridSettings): number {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || points.length < 2) return 0;
  const rise = elevationAt(last, tokens, grid) - elevationAt(first, tokens, grid);
  return rise / grid.scale.amount;
}

export interface ElevationShadow {
  radiusX: number;
  radiusY: number;
  fill: string;
  blur: number;
  shadowOpacity: number;
  isPit: boolean;
}

/**
 * Spostamento verticale in pixel dovuto alla quota (in su per quote positive, in giù per fosse).
 * Restituisce i pixel di cui alzare il token sull'asse Y dello schermo (quindi positivo = verso l'alto).
 */
export function elevationOffset(
  elevation: number | undefined,
  cellSize: number,
  scaleAmount = 5,
): number {
  if (!elevation || !Number.isFinite(elevation)) return 0;
  const unit = scaleAmount > 0 ? scaleAmount : 5;
  const absCells = Math.abs(elevation) / unit;
  if (absCells === 0) return 0;
  const isPositive = elevation > 0;
  const factor = absCells <= 1 ? absCells * 0.28 : 0.28 + Math.log2(absCells) * 0.38;
  const maxFactor = isPositive ? 2.5 : 1.2;
  const clamped = Math.min(factor, maxFactor);
  return (isPositive ? 1 : -1) * clamped * cellSize;
}

/**
 * Calcola la forma e le proprietà dell'ombra ellittica sul pavimento della griglia.
 * In quota l'ombra si ammorbidisce e si sfuma; nelle fosse segna l'apertura del terreno.
 */
export function elevationShadow(
  elevation: number | undefined,
  radius: number,
  cellSize: number,
  scaleAmount = 5,
): ElevationShadow | null {
  if (!elevation || !Number.isFinite(elevation)) return null;
  const unit = scaleAmount > 0 ? scaleAmount : 5;
  const absCells = Math.abs(elevation) / unit;
  if (absCells === 0) return null;

  if (elevation > 0) {
    const spread = Math.min(absCells / 12, 1);
    const radiusX = Math.max(radius * 0.6, radius * (0.95 - spread * 0.25));
    const radiusY = radiusX * 0.52;
    const blur = Math.max(4, cellSize * (0.08 + spread * 0.24));
    const opacity = Math.max(0.18, 0.45 - spread * 0.22);
    return {
      radiusX,
      radiusY,
      fill: `rgba(15, 12, 22, ${opacity.toFixed(3)})`,
      blur,
      shadowOpacity: Math.min(0.6, opacity * 1.2),
      isPit: false,
    };
  }

  const depth = Math.min(absCells / 6, 1);
  const radiusX = radius * (1.02 + depth * 0.08);
  const radiusY = radiusX * 0.55;
  const blur = Math.max(6, cellSize * (0.1 + depth * 0.15));
  const opacity = Math.min(0.65, 0.45 + depth * 0.18);
  return {
    radiusX,
    radiusY,
    fill: `rgba(10, 8, 16, ${opacity.toFixed(3)})`,
    blur,
    shadowOpacity: opacity,
    isPit: true,
  };
}

/**
 * Livello di ombreggiatura da sovrapporre al token quando sprofonda in una fossa (< 0).
 */
export function pitOverlayShade(elevation: number | undefined, scaleAmount = 5): number {
  if (!elevation || elevation >= 0 || !Number.isFinite(elevation)) return 0;
  const unit = scaleAmount > 0 ? scaleAmount : 5;
  const absCells = Math.abs(elevation) / unit;
  return Math.min(0.4, 0.18 + Math.min(absCells / 6, 1) * 0.2);
}

/** Quota da mostrare sul token: «+15 ft», «-5 m». */
export function formatElevation(elevation: number, grid: GridSettings): string {
  const unit = grid.scale.unit ? ` ${grid.scale.unit}` : "";
  return `${elevation > 0 ? "+" : ""}${round1(elevation)}${unit}`;
}

/** Con la griglia attiva i punti del righello vanno al centro delle caselle (Alt: liberi). */
export function snapRulerPoint(p: Point, grid: GridSettings, free: boolean): Point {
  return grid.enabled && !free ? snapTokenCenter(p, 1, grid) : p;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** "30 ft · 6 caselle". Il numero di caselle si omette quando coincide con il valore. */
export function formatDistance(cells: number, grid: GridSettings): string {
  const value = round1(cells * grid.scale.amount);
  const unit = grid.scale.unit ? ` ${grid.scale.unit}` : "";
  const count = round1(cells);
  if (grid.scale.amount === 1 && !grid.scale.unit) return `${count}`;
  return i18n.t("core.measure.distance", { value, unit, count });
}
