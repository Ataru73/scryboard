/// <reference lib="webworker" />
import { type SightGeometry, visibilityPolygon } from "./visibility";

export interface PolygonRequest {
  requestId: number;
  geometry: SightGeometry;
  sources: { key: string; x: number; y: number; radius: number }[];
}

export interface PolygonResponse {
  requestId: number;
  results: [string, number[]][];
}

self.onmessage = (event: MessageEvent<PolygonRequest>) => {
  const { requestId, geometry, sources } = event.data;
  const results: [string, number[]][] = sources.map((s) => [
    s.key,
    visibilityPolygon({ x: s.x, y: s.y }, geometry, s.radius),
  ]);
  (self as unknown as Worker).postMessage({ requestId, results } satisfies PolygonResponse);
};
