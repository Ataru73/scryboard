import type { GridSettings, TokenItem } from "@scryboard/shared";
import type Konva from "konva";
import { useTranslation } from "react-i18next";
import { Circle, Group, Label, Line, Rect, Shape, Tag, Text } from "react-konva";
import {
  DEFAULT_LINE_WIDTH,
  type TemplateGeometry,
  templateCells,
  templateContains,
  templateLabel,
} from "./areas";

/** Corpo della sagoma nelle sue coordinate locali (l'origine in (0, 0), direzione verso +x). */
export function TemplateBody({
  geometry,
  color,
  cell,
}: {
  geometry: TemplateGeometry;
  color: string;
  cell: number;
}) {
  const length = geometry.size * cell;
  const common = {
    fill: color,
    opacity: 0.28,
    stroke: color,
    strokeWidth: 2,
    strokeScaleEnabled: false,
  };
  switch (geometry.shape) {
    case "circle":
      return <Circle radius={length} {...common} />;
    case "cone":
      return <Line points={[0, 0, length, -length / 2, length, length / 2]} closed {...common} />;
    case "cube":
      return <Rect x={0} y={-length / 2} width={length} height={length} {...common} />;
    case "line": {
      const half = ((geometry.width ?? DEFAULT_LINE_WIDTH) * cell) / 2;
      return <Rect x={0} y={-half} width={length} height={2 * half} {...common} />;
    }
  }
}

/** Token (visibili a chi guarda) il cui centro è dentro la sagoma. */
export function tokensInside(
  geometry: TemplateGeometry,
  tokens: TokenItem[],
  cell: number,
): TokenItem[] {
  return tokens.filter((t) => templateContains(geometry, t, cell));
}

/** Caselle colorate e contorno dei token toccati: senza il corpo, che sta nell'oggetto. */
export function AreaHighlights({
  geometry,
  color,
  grid,
  tokens,
}: {
  geometry: TemplateGeometry;
  color: string;
  grid: GridSettings;
  tokens: TokenItem[];
}) {
  const cells = templateCells(geometry, grid);
  const hit = tokensInside(geometry, tokens, grid.size);
  return (
    <Group name="area-highlights" listening={false}>
      {cells.length > 0 && (
        <Shape
          sceneFunc={(ctx: Konva.Context) => {
            ctx.beginPath();
            for (const cell of cells) {
              const [first, ...rest] = cell.corners;
              if (!first) continue;
              ctx.moveTo(first.x, first.y);
              for (const p of rest) ctx.lineTo(p.x, p.y);
              ctx.closePath();
            }
            ctx.setAttr("fillStyle", color);
            ctx.setAttr("globalAlpha", 0.32);
            ctx.fill();
          }}
        />
      )}
      {hit.map((t) => (
        <Circle
          key={t.id}
          x={t.x}
          y={t.y}
          radius={(t.size * grid.size) / 2 + 5}
          stroke={color}
          strokeWidth={4}
          dash={[8, 5]}
        />
      ))}
    </Group>
  );
}

/** Sagoma in anteprima (propria o di un altro): corpo, caselle, token toccati ed etichetta. */
export function AreaPreview({
  geometry,
  color,
  grid,
  tokens,
  scale,
}: {
  geometry: TemplateGeometry;
  color: string;
  grid: GridSettings;
  tokens: TokenItem[];
  scale: number;
}) {
  const { t } = useTranslation();
  const length = geometry.size * grid.size;
  const rad = (geometry.rotation * Math.PI) / 180;
  const end =
    geometry.shape === "circle"
      ? { x: geometry.x, y: geometry.y - length }
      : {
          x: geometry.x + length * Math.cos(rad),
          y: geometry.y + length * Math.sin(rad),
        };
  const count = tokensInside(geometry, tokens, grid.size).length;
  const text =
    count > 0
      ? t("core.templates.summary", { label: templateLabel(geometry, grid), count })
      : templateLabel(geometry, grid);
  return (
    <Group listening={false} name="area-preview">
      <Group x={geometry.x} y={geometry.y} rotation={geometry.rotation}>
        <TemplateBody geometry={geometry} color={color} cell={grid.size} />
      </Group>
      <AreaHighlights geometry={geometry} color={color} grid={grid} tokens={tokens} />
      <Group x={end.x} y={end.y} scaleX={1 / scale} scaleY={1 / scale}>
        <Label x={10} y={10}>
          <Tag fill="#1d1a24" opacity={0.9} cornerRadius={4} />
          <Text text={text} fontSize={13} padding={5} fill="#ffffff" fontStyle="bold" />
        </Label>
      </Group>
    </Group>
  );
}
