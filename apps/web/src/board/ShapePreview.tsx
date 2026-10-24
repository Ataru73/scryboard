import type { ShapeItem } from "@scryboard/shared";
import { Ellipse, Line, Rect } from "react-konva";
import { normalizeBox } from "./geometry";
import type { Point } from "./viewport";

interface Props {
  shape: ShapeItem["shape"];
  start: Point;
  end: Point;
  color: string;
  strokeWidth: number;
  filled: boolean;
}

/** Anteprima locale della forma mentre la si disegna. */
export function ShapePreview({ shape, start, end, color, strokeWidth, filled }: Props) {
  if (shape === "line") {
    return (
      <Line
        points={[start.x, start.y, end.x, end.y]}
        stroke={color}
        strokeWidth={strokeWidth}
        lineCap="round"
      />
    );
  }
  const box = normalizeBox(start, end);
  const common = { stroke: color, strokeWidth, fill: filled ? color : undefined };
  if (shape === "rect") return <Rect {...box} {...common} />;
  return (
    <Ellipse
      x={box.x + box.width / 2}
      y={box.y + box.height / 2}
      radiusX={box.width / 2}
      radiusY={box.height / 2}
      {...common}
    />
  );
}
