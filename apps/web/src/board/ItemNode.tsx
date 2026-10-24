import { assetUrl, type BoardItem, type ImageItem } from "@scryboard/shared";
import type Konva from "konva";
import { memo } from "react";
import { Ellipse, Group, Image, Line, Rect, Text } from "react-konva";
import { normalizeBox } from "./geometry";
import { useImage } from "./useImage";

export const FONT_FAMILY = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
export const LINE_HEIGHT = 1.2;
/** Area cliccabile minima attorno a linee e bordi, in pixel del mondo. */
const HIT_WIDTH = 12;

interface Props {
  item: BoardItem;
  roomId: string;
  draggable: boolean;
  hidden: boolean;
  onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => void;
}

export const ItemNode = memo(function ItemNode({
  item,
  roomId,
  draggable,
  hidden,
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
      opacity={hidden ? 0 : 1}
      onDragEnd={onDragEnd}
    >
      <ItemContent item={item} roomId={roomId} />
    </Group>
  );
});

function ItemContent({ item, roomId }: { item: BoardItem; roomId: string }) {
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
