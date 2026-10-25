import { useEffect, useRef, useState } from "react";
import { type SightGeometry, visibilityPolygon } from "./visibility";
import type { PolygonRequest, PolygonResponse } from "./visibility.worker";

export interface PolygonSource {
  id: string;
  x: number;
  y: number;
  /** Raggio massimo in pixel del mondo; 0 = illimitato. */
  radius: number;
}

const sourceKey = (s: PolygonSource) =>
  `${s.x.toFixed(2)},${s.y.toFixed(2)},${s.radius.toFixed(2)}`;

let sharedWorker: Worker | null | undefined;
function getWorker(): Worker | null {
  if (sharedWorker !== undefined) return sharedWorker;
  try {
    sharedWorker = new Worker(new URL("./visibility.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    sharedWorker = null;
  }
  return sharedWorker;
}

/**
 * Poligoni di visibilità per le sorgenti date, calcolati in un Web Worker e messi in cache per
 * posizione: spostando un token si ricalcola solo il suo. Durante il calcolo restano quelli
 * precedenti, così la vista non lampeggia.
 */
export function useVisibilityPolygons(
  geometry: SightGeometry,
  sources: PolygonSource[],
): ReadonlyMap<string, number[]> {
  const [polygons, setPolygons] = useState<ReadonlyMap<string, number[]>>(new Map());
  const cache = useRef(new Map<string, number[]>());
  const cachedGeometry = useRef<SightGeometry | null>(null);
  const requestId = useRef(0);
  const sourcesKey = sources.map((s) => `${s.id}:${sourceKey(s)}`).join(";");

  // biome-ignore lint/correctness/useExhaustiveDependencies: `sources` è riassunto da sourcesKey.
  useEffect(() => {
    if (cachedGeometry.current !== geometry) {
      cache.current.clear();
      cachedGeometry.current = geometry;
    }
    const publish = () =>
      setPolygons(
        new Map(
          sources.flatMap((s) => {
            const poly = cache.current.get(sourceKey(s));
            return poly ? [[s.id, poly] as const] : [];
          }),
        ),
      );
    const missing = sources.filter((s) => !cache.current.has(sourceKey(s)));
    if (missing.length === 0) {
      publish();
      return;
    }
    const id = ++requestId.current;
    const worker = getWorker();
    if (!worker) {
      for (const s of missing)
        cache.current.set(sourceKey(s), visibilityPolygon(s, geometry, s.radius));
      publish();
      return;
    }
    const onMessage = (event: MessageEvent<PolygonResponse>) => {
      if (event.data.requestId !== id) return;
      for (const [key, poly] of event.data.results) cache.current.set(key, poly);
      publish();
    };
    worker.addEventListener("message", onMessage);
    worker.postMessage({
      requestId: id,
      geometry,
      sources: missing.map((s) => ({ key: sourceKey(s), x: s.x, y: s.y, radius: s.radius })),
    } satisfies PolygonRequest);
    return () => worker.removeEventListener("message", onMessage);
  }, [geometry, sourcesKey]);

  return polygons;
}
