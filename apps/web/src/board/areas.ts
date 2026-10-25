import type { GridSettings, TemplateItem, TemplateShape } from "@scryboard/shared";
import { snapGridCorner } from "./grid";
import { hexCorners, hexToPixel, isHex, visibleHexes } from "./hex";
import type { Box, Point } from "./viewport";

/** Sagoma d'area: la parte di `TemplateItem` che ne descrive la forma. */
export type TemplateGeometry = Pick<TemplateItem, "shape" | "x" | "y" | "rotation" | "size"> & {
  width?: number;
};

/** Larghezza predefinita del raggio, in caselle. */
export const DEFAULT_LINE_WIDTH = 1;

const EPSILON = 1e-6;

/** Semi-larghezza della sagoma, in pixel, dove la lunghezza locale è `x` (lungo la direzione). */
function halfWidthAt(t: TemplateGeometry, x: number, cell: number): number {
  const length = t.size * cell;
  if (t.shape === "cone") return x / 2;
  if (t.shape === "cube") return length / 2;
  return ((t.width ?? DEFAULT_LINE_WIDTH) * cell) / 2;
}

/** Il punto (in coordinate mondo) cade dentro la sagoma? `cell` è la casella in pixel. */
export function templateContains(t: TemplateGeometry, p: Point, cell: number): boolean {
  const rad = (-t.rotation * Math.PI) / 180;
  const dx = p.x - t.x;
  const dy = p.y - t.y;
  const x = dx * Math.cos(rad) - dy * Math.sin(rad);
  const y = dx * Math.sin(rad) + dy * Math.cos(rad);
  const length = t.size * cell;
  if (t.shape === "circle") return Math.hypot(x, y) <= length + EPSILON;
  return x >= -EPSILON && x <= length + EPSILON && Math.abs(y) <= halfWidthAt(t, x, cell) + EPSILON;
}

/** Riquadro locale (prima della rotazione), relativo all'origine, per selezione e adattamento. */
export function templateLocalBox(t: TemplateGeometry, cell: number): Box {
  const length = t.size * cell;
  if (t.shape === "circle")
    return { x: -length, y: -length, width: 2 * length, height: 2 * length };
  const half = halfWidthAt(t, length, cell);
  return { x: 0, y: -half, width: length, height: 2 * half };
}

/** Sagoma disegnata trascinando dall'origine `from` al punto `to`. */
export function templateFromDrag(
  shape: TemplateShape,
  from: Point,
  to: Point,
  grid: GridSettings,
  free: boolean,
): TemplateGeometry {
  const snapped = grid.enabled && !free;
  const origin = snapped ? snapGridCorner(from, grid) : from;
  const dx = to.x - origin.x;
  const dy = to.y - origin.y;
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  let cells = Math.hypot(dx, dy) / grid.size;
  if (snapped) {
    // Direzioni a multipli di 15° e lunghezze intere: i cerchi non hanno direzione.
    angle = Math.round(angle / 15) * 15;
    cells = Math.max(1, Math.round(cells));
  } else {
    cells = Math.max(0.1, Math.round(cells * 10) / 10);
  }
  return { shape, x: origin.x, y: origin.y, rotation: shape === "circle" ? 0 : angle, size: cells };
}

/** Casella toccata da una sagoma: il centro e i vertici, per colorarla. */
export interface AreaCell {
  center: Point;
  corners: Point[];
}

/** Caselle il cui centro cade dentro la sagoma (vale per le griglie quadrate ed esagonali). */
export function templateCells(t: TemplateGeometry, grid: GridSettings): AreaCell[] {
  if (!grid.enabled) return [];
  const box = templateLocalBox(t, grid.size);
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [bx, by] of [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height],
  ] as const) {
    xs.push(t.x + bx * cos - by * sin);
    ys.push(t.y + bx * sin + by * cos);
  }
  const bounds: Box = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
  const cells: AreaCell[] = [];
  if (isHex(grid)) {
    for (const h of visibleHexes(grid, bounds)) {
      const center = hexToPixel(h, grid);
      if (templateContains(t, center, grid.size)) {
        cells.push({ center, corners: hexCorners(h, grid) });
      }
    }
    return cells;
  }
  const first = (v: number, offset: number) => Math.floor((v - offset) / grid.size);
  const c0 = first(bounds.x, grid.offsetX);
  const c1 = first(bounds.x + bounds.width, grid.offsetX);
  const r0 = first(bounds.y, grid.offsetY);
  const r1 = first(bounds.y + bounds.height, grid.offsetY);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const x = grid.offsetX + c * grid.size;
      const y = grid.offsetY + r * grid.size;
      const center = { x: x + grid.size / 2, y: y + grid.size / 2 };
      if (!templateContains(t, center, grid.size)) continue;
      cells.push({
        center,
        corners: [
          { x, y },
          { x: x + grid.size, y },
          { x: x + grid.size, y: y + grid.size },
          { x, y: y + grid.size },
        ],
      });
    }
  }
  return cells;
}

/** Distanza di una sagoma, per l'etichetta: "20 ft" (lunghezza o raggio). */
export function templateLabel(t: TemplateGeometry, grid: GridSettings): string {
  const value = Math.round(t.size * grid.scale.amount * 10) / 10;
  const unit = grid.scale.unit ? ` ${grid.scale.unit}` : "";
  const name = { circle: "Cerchio", cone: "Cono", cube: "Cubo", line: "Raggio" }[t.shape];
  return `${name} ${value}${unit}`;
}
