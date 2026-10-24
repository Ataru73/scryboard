import { type BoardItem, DEFAULT_GRID } from "@scryboard/shared";
import { pathBounds } from "../paths/geometry";
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
    case "light": {
      // L'icona della luce (solo per il GM): un piccolo disco attorno al centro.
      const r = cellSize * 0.3;
      return { x: -r, y: -r, width: 2 * r, height: 2 * r };
    }
    case "image":
      return { x: 0, y: 0, width: item.width, height: item.height };
    case "shape":
      return normalizeBox({ x: 0, y: 0 }, { x: item.width, y: item.height });
    case "stroke": {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i + 1 < item.points.length; i += 2) {
        const x = item.points[i] as number;
        const y = item.points[i + 1] as number;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      const half = item.strokeWidth / 2;
      return {
        x: minX - half,
        y: minY - half,
        width: maxX - minX + item.strokeWidth,
        height: maxY - minY + item.strokeWidth,
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

export function unionBounds(items: BoardItem[], cellSize = DEFAULT_GRID.size): Box | null {
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
      return { points: item.points.map((v, i) => v * (i % 2 === 0 ? sx : sy)) };
    case "token":
    case "path":
    case "light":
      // Niente Transformer: la taglia dei token e i punti dei percorsi si cambiano a parte.
      return {};
    case "text":
      return {
        fontSize: Math.max(4, item.fontSize * sy),
        width: item.width === null ? null : Math.max(10, item.width * sx),
      };
  }
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return (
    a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
  );
}
