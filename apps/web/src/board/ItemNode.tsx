import {
  assetUrl,
  type BoardItem,
  type ImageItem,
  type LightItem,
  type PathItem,
  type StampItem,
  type TokenItem,
} from "@scryboard/shared";
import type Konva from "konva";
import { memo } from "react";
import { Circle, Ellipse, Group, Image, Line, Rect, Text } from "react-konva";
import { PathShape } from "../paths/PathShape";
import { stampImage } from "../stamps/generate";
import { normalizeBox } from "./geometry";
import { tokenInitials } from "./grid";
import { useImage } from "./useImage";

export const FONT_FAMILY = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
export const LINE_HEIGHT = 1.2;
/** Area cliccabile minima attorno a linee e bordi, in pixel del mondo. */
const HIT_WIDTH = 12;

export const SELECTION_COLOR = "#8e7cf0";

interface Props {
  item: BoardItem;
  roomId: string;
  cellSize: number;
  draggable: boolean;
  /** Testo in modifica: lo copre la textarea. */
  editing: boolean;
  /** Nascosto ai giocatori: il GM lo vede semitrasparente. */
  concealed: boolean;
  /** Evidenzia la selezione dei token, che non usano il Transformer. */
  selected: boolean;
  onDragStart?: (event: Konva.KonvaEventObject<DragEvent>) => void;
  onDragMove?: (event: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => void;
}

export const ItemNode = memo(function ItemNode({
  item,
  roomId,
  cellSize,
  draggable,
  editing,
  concealed,
  selected,
  onDragStart,
  onDragMove,
  onDragEnd,
}: Props) {
  return (
    <Group
      id={item.id}
      name="item"
      x={item.x}
      y={item.y}
      rotation={item.rotation}
      draggable={draggable}
      opacity={editing ? 0 : concealed ? 0.4 : 1}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    >
      {item.kind === "token" ? (
        <TokenContent item={item} roomId={roomId} cellSize={cellSize} selected={selected} />
      ) : item.kind === "path" ? (
        <PathShape points={item.points} style={item.style} selected={selected} />
      ) : item.kind === "stamp" ? (
        <StampContent item={item} cellSize={cellSize} selected={selected} />
      ) : item.kind === "light" ? (
        <LightIcon color={item.color} cellSize={cellSize} selected={selected} />
      ) : (
        <ItemContent item={item} roomId={roomId} />
      )}
    </Group>
  );
});

function ItemContent({
  item,
  roomId,
}: {
  item: Exclude<BoardItem, TokenItem | PathItem | LightItem | StampItem>;
  roomId: string;
}) {
  switch (item.kind) {
    case "image":
      return <ImageContent item={item} roomId={roomId} />;
    case "stroke":
      return (
        <Line
          points={item.points}
          stroke={item.color}
          strokeWidth={item.strokeWidth}
          hitStrokeWidth={Math.max(HIT_WIDTH, item.strokeWidth)}
          lineCap="round"
          lineJoin="round"
          tension={0.4}
        />
      );
    case "shape": {
      const common = {
        stroke: item.color,
        strokeWidth: item.strokeWidth,
        hitStrokeWidth: Math.max(HIT_WIDTH, item.strokeWidth),
        fill: item.fill ?? undefined,
      };
      if (item.shape === "line") {
        return <Line points={[0, 0, item.width, item.height]} {...common} lineCap="round" />;
      }
      const box = normalizeBox({ x: 0, y: 0 }, { x: item.width, y: item.height });
      if (item.shape === "rect") return <Rect {...box} {...common} />;
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
    case "text":
      return (
        <Text
          text={item.text || " "}
          fontSize={item.fontSize}
          fontFamily={FONT_FAMILY}
          lineHeight={LINE_HEIGHT}
          fill={item.color}
          width={item.width ?? undefined}
        />
      );
  }
}

function ImageContent({ item, roomId }: { item: ImageItem; roomId: string }) {
  const image = useImage(assetUrl(roomId, item.assetId));
  if (!image) {
    return (
      <Rect width={item.width} height={item.height} fill="#8884" stroke="#8888" dash={[8, 8]} />
    );
  }
  return <Image image={image} width={item.width} height={item.height} />;
}

function TokenContent({
  item,
  roomId,
  cellSize,
  selected,
}: {
  item: TokenItem;
  roomId: string;
  cellSize: number;
  selected: boolean;
}) {
  const r = (item.size * cellSize) / 2;
  const ring = Math.max(2, r * 0.1);
  const labelSize = Math.max(10, cellSize * 0.22);
  return (
    <>
      {selected && (
        <Circle radius={r + ring + 3} stroke={SELECTION_COLOR} strokeWidth={3} dash={[6, 4]} />
      )}
      <Circle
        radius={r}
        fill={item.color}
        shadowColor="#000000"
        shadowOpacity={0.35}
        shadowBlur={6}
        shadowOffsetY={2}
      />
      {item.assetId ? (
        <TokenImage roomId={roomId} assetId={item.assetId} radius={r - ring / 2} />
      ) : (
        <Text
          text={tokenInitials(item.name)}
          x={-r}
          y={-r}
          width={2 * r}
          height={2 * r}
          align="center"
          verticalAlign="middle"
          fontFamily={FONT_FAMILY}
          fontStyle="bold"
          fontSize={r * 0.8}
          fill="#ffffff"
        />
      )}
      <Circle radius={r - ring / 2} stroke={item.color} strokeWidth={ring} />
      {item.name && (
        <Text
          text={item.name}
          x={-cellSize * 2}
          y={r + 4}
          width={cellSize * 4}
          align="center"
          fontFamily={FONT_FAMILY}
          fontStyle="bold"
          fontSize={labelSize}
          fill="#ffffff"
          stroke="#1d1a24"
          strokeWidth={labelSize * 0.25}
          fillAfterStrokeEnabled
          listening={false}
        />
      )}
    </>
  );
}

/** Immagine ritagliata a cerchio, centrata e senza deformazioni. */
function TokenImage({
  roomId,
  assetId,
  radius,
}: {
  roomId: string;
  assetId: string;
  radius: number;
}) {
  const image = useImage(assetUrl(roomId, assetId));
  if (!image) return null;
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  return (
    <Group clipFunc={(ctx) => ctx.arc(0, 0, radius, 0, Math.PI * 2)}>
      <Image
        image={image}
        x={-radius}
        y={-radius}
        width={radius * 2}
        height={radius * 2}
        crop={{
          x: (image.naturalWidth - side) / 2,
          y: (image.naturalHeight - side) / 2,
          width: side,
          height: side,
        }}
      />
    </Group>
  );
}

/** Icona di una luce fissa (la vede solo il GM): un disco con raggi del colore della luce. */
function LightIcon({
  color,
  cellSize,
  selected,
}: {
  color: string;
  cellSize: number;
  selected: boolean;
}) {
  const r = cellSize * 0.2;
  const rays = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
  return (
    <>
      {selected && (
        <Circle radius={r * 1.9} stroke={SELECTION_COLOR} strokeWidth={2} dash={[5, 3]} />
      )}
      {rays.map((a) => (
        <Line
          key={a}
          points={[
            Math.cos(a) * r * 1.25,
            Math.sin(a) * r * 1.25,
            Math.cos(a) * r * 1.65,
            Math.sin(a) * r * 1.65,
          ]}
          stroke={color}
          strokeWidth={Math.max(1.5, r * 0.18)}
          lineCap="round"
        />
      ))}
      <Circle radius={r} fill={color} stroke="#1d1a24" strokeWidth={1.5} />
    </>
  );
}

/** Timbro di scenario: immagine procedurale centrata sull'origine, con un'ombra leggera. */
export function StampContent({
  item,
  cellSize,
  selected = false,
}: {
  item: Pick<StampItem, "stamp" | "variant" | "size">;
  cellSize: number;
  selected?: boolean;
}) {
  const side = item.size * cellSize;
  return (
    <>
      <Image
        image={stampImage(item.stamp, item.variant)}
        x={-side / 2}
        y={-side / 2}
        width={side}
        height={side}
        shadowColor="#000000"
        shadowOpacity={0.35}
        shadowBlur={side * 0.06}
        shadowOffset={{ x: side * 0.03, y: side * 0.04 }}
      />
      {selected && (
        <Rect
          x={-side / 2}
          y={-side / 2}
          width={side}
          height={side}
          stroke={SELECTION_COLOR}
          strokeWidth={2}
          strokeScaleEnabled={false}
          dash={[6, 4]}
          listening={false}
        />
      )}
    </>
  );
}
