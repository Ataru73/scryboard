import type { GridSettings } from "@scryboard/shared";
import { Shape } from "react-konva";
import { visibleGridLines } from "./grid";
import type { Box } from "./viewport";

interface Props {
  grid: GridSettings;
  /** Area del mondo visibile sullo schermo. */
  visible: Box;
  scale: number;
}

/** Disegna solo le linee visibili, con spessore costante di 1px sullo schermo. */
export function GridLines({ grid, visible, scale }: Props) {
  const lines = grid.enabled ? visibleGridLines(grid, visible, scale) : null;
  if (!lines) return null;
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(ctx) => {
        ctx.beginPath();
        for (const x of lines.xs) {
          ctx.moveTo(x, visible.y);
          ctx.lineTo(x, visible.y + visible.height);
        }
        for (const y of lines.ys) {
          ctx.moveTo(visible.x, y);
          ctx.lineTo(visible.x + visible.width, y);
        }
        ctx.strokeStyle = "rgba(29, 26, 36, 0.35)";
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
      }}
    />
  );
}
