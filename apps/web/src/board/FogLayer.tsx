import type { FogOp } from "@scryboard/shared";
import type Konva from "konva";
import { useEffect, useRef } from "react";
import { Layer, Line, Rect } from "react-konva";

export const FOG_COLOR = "#1d1a24";
const HUGE = 1e6;

/**
 * Nebbia: le operazioni si applicano in ordine sullo stesso canvas, "cover" dipinge e "reveal"
 * cancella (destination-out). Serve un Layer dedicato, altrimenti la cancellazione bucherebbe
 * anche la mappa sottostante. Il GM la vede semitrasparente.
 */
export function FogLayer({ ops, translucent }: { ops: FogOp[]; translucent: boolean }) {
  const layerRef = useRef<Konva.Layer>(null);
  // La trasparenza va sul canvas intero: l'opacity del Layer di Konva si applica a ogni forma,
  // e allora "reveal" cancellerebbe solo una parte della nebbia.
  useEffect(() => {
    const canvas = layerRef.current?.getNativeCanvasElement();
    if (canvas) canvas.style.opacity = translucent ? "0.45" : "1";
  });
  if (ops.length === 0) return null;
  return (
    <Layer ref={layerRef} listening={false}>
      {ops.map((op) => (
        <FogShape key={op.id} op={op} />
      ))}
    </Layer>
  );
}

export function FogShape({
  op,
  color = FOG_COLOR,
}: {
  op: FogOp | Omit<FogOp, "id" | "seq">;
  color?: string;
}) {
  const composite = op.mode === "reveal" ? "destination-out" : "source-over";
  const paint = op.mode === "reveal" ? "#000000" : color;
  switch (op.shape) {
    case "all":
      return (
        <Rect
          x={-HUGE}
          y={-HUGE}
          width={2 * HUGE}
          height={2 * HUGE}
          fill={paint}
          globalCompositeOperation={composite}
        />
      );
    case "rect": {
      const [x = 0, y = 0, width = 0, height = 0] = op.points;
      return (
        <Rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={paint}
          globalCompositeOperation={composite}
        />
      );
    }
    case "polygon":
      return <Line points={op.points} closed fill={paint} globalCompositeOperation={composite} />;
    case "brush":
      return (
        <Line
          points={op.points}
          stroke={paint}
          strokeWidth={op.width ?? 40}
          lineCap="round"
          lineJoin="round"
          globalCompositeOperation={composite}
        />
      );
  }
}
