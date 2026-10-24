/// <reference lib="webworker" />
import { visibilityPolygon } from "./visibility";

export interface PolygonRequest {
  requestId: number;
  segments: Float64Array;
  sources: { key: string; x: number; y: number; radius: number }[];
}

export interface PolygonResponse {
  requestId: number;
  results: [string, number[]][];
}

self.onmessage = (event: MessageEvent<PolygonRequest>) => {
  const { requestId, segments, sources } = event.data;
  const results: [string, number[]][] = sources.map((s) => [
    s.key,
    visibilityPolygon({ x: s.x, y: s.y }, segments, s.radius),
  ]);
  (self as unknown as Worker).postMessage({ requestId, results } satisfies PolygonResponse);
};
