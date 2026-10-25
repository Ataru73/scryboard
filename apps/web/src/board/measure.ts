import type { DiagonalRule, GridSettings } from "@scryboard/shared";
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
