import {
  type BoardItem,
  DEFAULT_VISION,
  type Door,
  doorCenter,
  type LightingSettings,
  type TokenItem,
} from "@scryboard/shared";
import type { Point } from "../board/viewport";
import { pointInPolygon } from "./visibility";

/** Sorgente di luce in pixel del mondo (luce fissa o portata da un token). */
export interface LightSource {
  id: string;
  x: number;
  y: number;
  bright: number;
  dim: number;
  color: string;
}

/** Punto di vista di un token in pixel del mondo; 0 = illimitato / assente. */
export interface VisionSource {
  id: string;
  x: number;
  y: number;
  range: number;
  darkvision: number;
}

/** Token attraverso cui vede un utente: quelli che ha creato e quelli che il GM gli ha assegnato. */
export function viewerTokens(items: BoardItem[], viewerId: string): TokenItem[] {
  return items.filter(
    (i): i is TokenItem =>
      i.kind === "token" && (i.createdBy === viewerId || (i.owners?.includes(viewerId) ?? false)),
  );
}

export function visionSources(tokens: TokenItem[], cellSize: number): VisionSource[] {
  return tokens.map((t) => {
    const vision = t.vision ?? DEFAULT_VISION;
    return {
      id: t.id,
      x: t.x,
      y: t.y,
      range: vision.range * cellSize,
      darkvision: vision.darkvision * cellSize,
    };
  });
}

/** Luci fisse e luci portate dai token. */
export function lightSources(items: BoardItem[], cellSize: number): LightSource[] {
  const out: LightSource[] = [];
  for (const item of items) {
    const spec = item.kind === "light" ? item : item.kind === "token" ? item.light : null;
    if (!spec || spec.dim <= 0) continue;
    out.push({
      // Prefisso: un token con una torcia è sia punto di vista sia luce, con poligoni diversi.
      id: `light:${item.id}`,
      x: item.x,
      y: item.y,
      bright: Math.min(spec.bright, spec.dim) * cellSize,
      dim: spec.dim * cellSize,
      color: spec.color,
    });
  }
  return out;
}

/** Poligoni di visibilità già calcolati, per id della sorgente. */
export type Polygons = ReadonlyMap<string, number[]>;

/**
 * Il punto è visibile a chi guarda attraverso `visions`? Deve stare nella linea di vista di
 * almeno un suo token (ed entro la sua portata) ed essere illuminato: di giorno e al crepuscolo
 * sempre, di notte solo entro la scurovisione o in una luce che lo raggiunge.
 */
export function isPointVisible(
  p: Point,
  visions: VisionSource[],
  lights: LightSource[],
  polygons: Polygons,
  ambient: LightingSettings["ambient"],
): boolean {
  for (const v of visions) {
    const poly = polygons.get(v.id);
    if (!poly || !pointInPolygon(p, poly)) continue;
    const distance = Math.hypot(p.x - v.x, p.y - v.y);
    if (v.range > 0 && distance > v.range) continue;
    if (ambient !== "night" || distance <= v.darkvision) return true;
    for (const light of lights) {
      const lightPoly = polygons.get(light.id);
      if (
        lightPoly &&
        Math.hypot(p.x - light.x, p.y - light.y) <= light.dim &&
        pointInPolygon(p, lightPoly)
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Una porta chiusa blocca la vista, quindi il suo centro sta proprio sul bordo della zona vista:
 * la si considera vista se si vede un punto appena davanti o appena dietro.
 */
export function isDoorSeen(door: Door, isVisible: (p: Point) => boolean): boolean {
  const c = doorCenter(door);
  const dx = (door.points[2] as number) - (door.points[0] as number);
  const dy = (door.points[3] as number) - (door.points[1] as number);
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * 3;
  const ny = (dx / len) * 3;
  return isVisible({ x: c.x + nx, y: c.y + ny }) || isVisible({ x: c.x - nx, y: c.y - ny });
}
