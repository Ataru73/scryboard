import type { BoardItem, GridSettings, LightingSettings, Wall } from "@scryboard/shared";
import { useCallback, useMemo } from "react";
import type { Point } from "../board/viewport";
import { isPointVisible, lightSources, viewerTokens, visionSources } from "./sources";
import { useVisibilityPolygons } from "./useVisibilityPolygons";
import { sightGeometry } from "./visibility";

/**
 * Tutto ciò che serve per luci e visione: sorgenti, poligoni (calcolati nel worker) e un test di
 * visibilità per punto. `viewerId` null = nessun punto di vista (il GM vede tutto).
 */
export function useVision({
  items,
  walls,
  grid,
  lighting,
  viewerId,
}: {
  items: BoardItem[];
  walls: Wall[];
  grid: GridSettings;
  lighting: LightingSettings;
  viewerId: string | null;
}) {
  const geometry = useMemo(() => sightGeometry(walls), [walls]);
  const lights = useMemo(
    () => (lighting.enabled ? lightSources(items, grid.size) : []),
    [items, grid.size, lighting.enabled],
  );
  const visions = useMemo(
    () =>
      lighting.enabled && viewerId ? visionSources(viewerTokens(items, viewerId), grid.size) : [],
    [items, grid.size, lighting.enabled, viewerId],
  );
  const sources = useMemo(
    () => [
      ...visions.map((v) => ({ id: v.id, x: v.x, y: v.y, radius: v.range })),
      ...lights.map((l) => ({ id: l.id, x: l.x, y: l.y, radius: l.dim })),
    ],
    [visions, lights],
  );
  const polygons = useVisibilityPolygons(geometry, sources);
  const active = lighting.enabled && viewerId !== null;
  const isVisible = useCallback(
    (p: Point) => !active || isPointVisible(p, visions, lights, polygons, lighting.ambient),
    [active, visions, lights, polygons, lighting.ambient],
  );
  return { active, visions, lights, polygons, isVisible };
}
