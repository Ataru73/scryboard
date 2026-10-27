import type { PathItem } from "@scryboard/shared";
import type Konva from "konva";
import { Circle } from "react-konva";
import { useIsTouchDevice } from "../board/touchDevice";
import { toFlat, toPathPoints } from "./geometry";

const COLOR = "#8e7cf0";

interface Props {
  item: PathItem;
  scale: number;
  selectedPoint: number | null;
  onSelectPoint: (index: number) => void;
  /** Nuovi punti (relativi all'oggetto); `commit` alla fine del trascinamento. */
  onChange: (points: number[], commit: boolean) => void;
}

/** Maniglie dei punti di controllo di un percorso selezionato: si trascinano per modificarlo. */
export function PathHandles({ item, scale, selectedPoint, onSelectPoint, onChange }: Props) {
  const isTouch = useIsTouchDevice();
  const points = toPathPoints(item.points);
  const moved = (index: number, e: Konva.KonvaEventObject<DragEvent>) => {
    const next = points.map((p, i) =>
      i === index ? { ...p, x: e.target.x() - item.x, y: e.target.y() - item.y } : p,
    );
    return toFlat(next);
  };
  return (
    <>
      {points.map((p, i) => (
        <Circle
          // biome-ignore lint/suspicious/noArrayIndexKey: i punti si identificano per posizione.
          key={i}
          name="path-handle"
          x={item.x + p.x}
          y={item.y + p.y}
          radius={(selectedPoint === i ? (isTouch ? 8.5 : 7) : isTouch ? 7 : 5.5) / scale}
          fill={selectedPoint === i ? COLOR : "#ffffff"}
          stroke={COLOR}
          strokeWidth={2 / scale}
          hitStrokeWidth={Math.max(isTouch ? 28 : 14, 14) / scale}
          draggable
          onPointerDown={(e) => {
            // Non deve partire la selezione a riquadro della lavagna.
            e.cancelBubble = true;
            onSelectPoint(i);
          }}
          onDragMove={(e) => onChange(moved(i, e), false)}
          onDragEnd={(e) => onChange(moved(i, e), true)}
        />
      ))}
    </>
  );
}
