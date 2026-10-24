import type { GridSettings } from "@scryboard/shared";
import { Shape } from "react-konva";
import { visibleGridLines } from "./grid";
import { hexCorners, isHex, visibleHexes } from "./hex";
import type { Box } from "./viewport";

interface Props {
  grid: GridSettings;
  /** Area del mondo visibile sullo schermo. */
  visible: Box;
  scale: number;
}

const STROKE = "rgba(29, 26, 36, 0.35)";

/** Disegna solo le linee (o gli esagoni) visibili, con spessore costante di 1px sullo schermo. */
export function GridLines({ grid, visible, scale }: Props) {
  if (!grid.enabled) return null;
  if (isHex(grid)) {
    // Sotto i 10 px gli esagoni sono troppi e troppo fitti per servire.
    if (grid.size * scale < 10) return null;
    const hexes = visibleHexes(grid, visible);
    return (
      <Shape
        listening={false}
        perfectDrawEnabled={false}
        sceneFunc={(ctx) => {
          ctx.beginPath();
          for (const h of hexes) {
            const corners = hexCorners(h, grid);
            // Tre lati per esagono bastano: gli altri tre li disegnano i vicini.
            ctx.moveTo((corners[0] as { x: number }).x, (corners[0] as { y: number }).y);
            for (let i = 1; i <= 3; i++)
              ctx.lineTo((corners[i] as { x: number }).x, (corners[i] as { y: number }).y);
          }
          ctx.strokeStyle = STROKE;
          ctx.lineWidth = 1 / scale;
          ctx.stroke();
        }}
      />
    );
  }
  const lines = visibleGridLines(grid, visible, scale);
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
        ctx.strokeStyle = STROKE;
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
      }}
    />
  );
}
