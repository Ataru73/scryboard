import type { Wall } from "@scryboard/shared";
import type Konva from "konva";
import { Circle } from "react-konva";
import { SELECTION_COLOR } from "../board/ItemNode";
import type { Point } from "../board/viewport";

interface Props {
  wall: Wall;
  scale: number;
  snap: (point: Point) => Point;
  /** Nuovi punti assoluti; `commit` soltanto alla fine del trascinamento. */
  onChange: (points: number[], commit: boolean) => void;
}

/** Maniglie dei vertici del muro selezionato; anche le modifiche restano agganciate alla griglia. */
export function WallHandles({ wall, scale, snap, onChange }: Props) {
  const moved = (index: number, event: Konva.KonvaEventObject<DragEvent>) => {
    const raw = { x: event.target.x(), y: event.target.y() };
    const point = event.evt.altKey ? raw : snap(raw);
    event.target.position(point);
    const points = wall.points.slice();
    points[index * 2] = point.x;
    points[index * 2 + 1] = point.y;
    return points;
  };
  return (
    <>
      {Array.from({ length: wall.points.length / 2 }, (_, index) => (
        <Circle
          // biome-ignore lint/suspicious/noArrayIndexKey: i vertici si identificano per posizione.
          key={index}
          name="wall-handle"
          x={wall.points[index * 2]}
          y={wall.points[index * 2 + 1]}
          radius={5.5 / scale}
          fill="#ffffff"
          stroke={SELECTION_COLOR}
          strokeWidth={2 / scale}
          hitStrokeWidth={10 / scale}
          draggable
          onPointerDown={(event) => {
            event.cancelBubble = true;
          }}
          onDragMove={(event) => onChange(moved(index, event), false)}
          onDragEnd={(event) => onChange(moved(index, event), true)}
        />
      ))}
    </>
  );
}
