import type { GridSettings } from "@scryboard/shared";
import { Circle, Group, Label, Line, Tag, Text } from "react-konva";
import { formatDistance, pathCells, withRise } from "./measure";
import type { Point } from "./viewport";

/** Misura condivisa tramite l'awareness: tappe fisse più il punto sotto il cursore. */
export interface RulerState {
  points: number[];
  /** Dislivello in caselle tra i due estremi (quote dei token). */
  rise?: number;
}

export const flattenPoints = (points: Point[]): number[] => points.flatMap((p) => [p.x, p.y]);

/**
 * Righello, proprio o di un altro: linea con una tappa per ogni vertice e l'etichetta della
 * distanza totale in fondo. Spessori e testo hanno dimensione costante a qualsiasi zoom.
 */
export function RulerShape({
  points,
  color,
  grid,
  scale,
  rise = 0,
}: {
  points: number[];
  color: string;
  grid: GridSettings;
  scale: number;
  rise?: number;
}) {
  const pts: Point[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    pts.push({ x: points[i] as number, y: points[i + 1] as number });
  }
  const last = pts[pts.length - 1];
  if (!last || pts.length < 2) return null;
  // Lo stato degli altri arriva dall'awareness: un dislivello non valido si ignora.
  const cells = withRise(pathCells(pts, grid), Number.isFinite(rise) ? rise : 0, grid);
  return (
    <Group name="ruler" listening={false}>
      <Line
        points={points}
        stroke="#ffffff"
        strokeWidth={5 / scale}
        opacity={0.8}
        lineCap="round"
        lineJoin="round"
      />
      <Line
        points={points}
        stroke={color}
        strokeWidth={3 / scale}
        dash={[10 / scale, 6 / scale]}
        lineCap="round"
        lineJoin="round"
      />
      {pts.map((p, i) => (
        <Circle
          // biome-ignore lint/suspicious/noArrayIndexKey: le tappe non hanno id.
          key={i}
          x={p.x}
          y={p.y}
          radius={4.5 / scale}
          fill={color}
          stroke="#ffffff"
          strokeWidth={1.5 / scale}
        />
      ))}
      <Group x={last.x} y={last.y} scaleX={1 / scale} scaleY={1 / scale}>
        <Label x={10} y={10}>
          <Tag fill="#1d1a24" opacity={0.9} cornerRadius={4} />
          <Text
            text={formatDistance(cells, grid)}
            fontSize={13}
            padding={5}
            fill="#ffffff"
            fontStyle="bold"
          />
        </Label>
      </Group>
    </Group>
  );
}
