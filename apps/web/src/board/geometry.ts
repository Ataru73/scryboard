import { type BoardItem, DEFAULT_GRID } from "@scryboard/shared";
import { pathBounds } from "../paths/geometry";
import { templateLocalBox } from "./areas";
import type { Box, Point } from "./viewport";

export function normalizeBox(a: Point, b: Point): Box {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/**
 * Riquadro dell'oggetto non ruotato, relativo alla sua origine (x, y). Per i token l'origine è
 * il centro e il diametro dipende dalla casella della griglia.
 */
export function localBox(item: BoardItem, cellSize = DEFAULT_GRID.size): Box {
  switch (item.kind) {
    case "token": {
      const r = (item.size * cellSize) / 2;
      return { x: -r, y: -r, width: 2 * r, height: 2 * r };
    }
    case "path":
      return pathBounds(item.points);
    case "template":
      return templateLocalBox(item, cellSize);
    case "stamp": {
      const r = (item.size * cellSize) / 2;
      return { x: -r, y: -r, width: 2 * r, height: 2 * r };
    }
    case "connector":
      // Gli estremi dipendono dagli oggetti collegati: vedi `connectorEnds`.
      return { x: 0, y: 0, width: 0, height: 0 };
    case "note": {
      // Il pin: un disco di mezza casella attorno al punto.
      const r = cellSize * 0.3;
      return { x: -r, y: -r, width: 2 * r, height: 2 * r };
    }
    case "light": {
      // L'icona della luce (solo per il GM): un piccolo disco attorno al centro.
      const r = cellSize * 0.3;
      return { x: -r, y: -r, width: 2 * r, height: 2 * r };
    }
    case "image":
      return { x: 0, y: 0, width: item.width, height: item.height };
    case "shape":
      return normalizeBox({ x: 0, y: 0 }, { x: item.width, y: item.height });
    case "roof":
      return pointsBox(item.points);
    case "stroke": {
      const box = pointsBox(item.points);
      const half = item.strokeWidth / 2;
      return {
        x: box.x - half,
        y: box.y - half,
        width: box.width + item.strokeWidth,
        height: box.height + item.strokeWidth,
      };
    }
    case "text": {
      // Stima: per il centraggio della vista basta un'approssimazione.
      const lines = item.text.split("\n");
      const longest = Math.max(1, ...lines.map((l) => l.length));
      return {
        x: 0,
        y: 0,
        width: item.width ?? longest * item.fontSize * 0.6,
        height: lines.length * item.fontSize * 1.2,
      };
    }
  }
}

/** Riquadro di una lista di punti [x0, y0, x1, y1, ...]. */
function pointsBox(points: number[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i] as number;
    const y = points[i + 1] as number;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Riquadro in coordinate mondo, tenendo conto della rotazione. */
export function itemBounds(item: BoardItem, cellSize = DEFAULT_GRID.size): Box {
  const box = localBox(item, cellSize);
  const rad = (item.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x, y: box.y + box.height },
    { x: box.x + box.width, y: box.y + box.height },
  ].map((p) => ({ x: item.x + p.x * cos - p.y * sin, y: item.y + p.x * sin + p.y * cos }));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function unionBounds(all: BoardItem[], cellSize = DEFAULT_GRID.size): Box | null {
  // I connettori stanno tra oggetti già contati e non hanno un riquadro proprio.
  const items = all.filter((i) => i.kind !== "connector");
  if (items.length === 0) return null;
  const boxes = items.map((item) => itemBounds(item, cellSize));
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * Converte la scala applicata dal Transformer di Konva in dimensioni dell'oggetto, così che la
 * scala del nodo torni a 1 e lo spessore dei tratti non venga deformato.
 */
export function bakeScale(item: BoardItem, sx: number, sy: number): Record<string, unknown> {
  switch (item.kind) {
    case "image":
      return { width: Math.max(1, item.width * sx), height: Math.max(1, item.height * sy) };
    case "shape":
      return { width: item.width * sx, height: item.height * sy };
    case "stroke":
    case "roof":
      return { points: item.points.map((v, i) => v * (i % 2 === 0 ? sx : sy)) };
    case "stamp":
      // Il Transformer mantiene le proporzioni: la scala diventa la taglia del timbro.
      return { size: Math.max(0.1, item.size * Math.max(sx, sy)) };
    case "token":
    case "path":
    case "light":
    case "note":
    case "connector":
    case "template":
      // Niente Transformer: la taglia dei token e i punti dei percorsi si cambiano a parte.
      return {};
    case "text":
      return {
        fontSize: Math.max(4, item.fontSize * sy),
        width: item.width === null ? null : Math.max(10, item.width * sx),
      };
  }
}

/** Il punto cade dentro il riquadro dell'oggetto, tenendo conto della rotazione. */
export function pointInItem(p: Point, item: BoardItem, cellSize = DEFAULT_GRID.size): boolean {
  const box = localBox(item, cellSize);
  const rad = (-item.rotation * Math.PI) / 180;
  const dx = p.x - item.x;
  const dy = p.y - item.y;
  const x = dx * Math.cos(rad) - dy * Math.sin(rad);
  const y = dx * Math.sin(rad) + dy * Math.cos(rad);
  // I tetti procedurali seguono la loro forma, non il riquadro.
  if (item.kind === "roof") return pointInPolygon({ x, y }, item.points);
  return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
}

/** Il punto sta dentro il poligono [x0, y0, x1, y1, ...] (regola pari-dispari). */
export function pointInPolygon(p: Point, points: number[]): boolean {
  let inside = false;
  const n = points.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[2 * i] as number;
    const yi = points[2 * i + 1] as number;
    const xj = points[2 * j] as number;
    const yj = points[2 * j + 1] as number;
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Oggetti disegnati attorno al loro punto (x, y): un connettore si ferma sul loro cerchio. */
const ROUND_KINDS: BoardItem["kind"][] = ["token", "stamp", "note", "light"];

/** Spazio tra la punta del connettore e il bordo dell'oggetto. */
const CONNECTOR_GAP = 4;

/**
 * Estremi di un connettore: dal bordo dell'oggetto di partenza a quello di arrivo, lungo la
 * retta che ne unisce i centri. `offsets` sposta gli oggetti che si stanno trascinando.
 */
export function connectorEnds(
  from: BoardItem,
  to: BoardItem,
  cellSize: number,
  offsets?: ReadonlyMap<string, Point>,
): { from: Point; to: Point } {
  const shape = (item: BoardItem) => {
    const offset = offsets?.get(item.id) ?? { x: 0, y: 0 };
    if (ROUND_KINDS.includes(item.kind)) {
      const r = localBox(item, cellSize).width / 2;
      return { center: { x: item.x + offset.x, y: item.y + offset.y }, r, half: null };
    }
    const box = itemBounds(item, cellSize);
    return {
      center: { x: box.x + box.width / 2 + offset.x, y: box.y + box.height / 2 + offset.y },
      r: 0,
      half: { x: box.width / 2, y: box.height / 2 },
    };
  };
  const a = shape(from);
  const b = shape(to);
  const dx = b.center.x - a.center.x;
  const dy = b.center.y - a.center.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { from: a.center, to: b.center };
  // Distanza dal centro al bordo lungo la direzione (ux, uy).
  const exit = (s: typeof a, ux: number, uy: number) => {
    if (!s.half) return s.r;
    const tx = ux === 0 ? Infinity : s.half.x / Math.abs(ux);
    const ty = uy === 0 ? Infinity : s.half.y / Math.abs(uy);
    return Math.min(tx, ty);
  };
  const ux = dx / length;
  const uy = dy / length;
  const start = exit(a, ux, uy) + CONNECTOR_GAP;
  const end = exit(b, ux, uy) + CONNECTOR_GAP;
  // Oggetti sovrapposti: si collegano i centri.
  if (start + end >= length) return { from: a.center, to: b.center };
  return {
    from: { x: a.center.x + ux * start, y: a.center.y + uy * start },
    to: { x: b.center.x - ux * end, y: b.center.y - uy * end },
  };
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return (
    a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
  );
}
