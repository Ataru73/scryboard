import {
  assetUrl,
  type BoardItem,
  type ImageItem,
  type LightItem,
  type LightingSettings,
  type PathItem,
  type StampItem,
  type TemplateItem,
  type TokenItem,
} from "@scryboard/shared";
import type Konva from "konva";
import { memo, useMemo } from "react";
import { Circle, Ellipse, Group, Image, Line, Path, Rect, Text } from "react-konva";
import { PathShape } from "../paths/PathShape";
import { stampImage } from "../stamps/generate";
import { normalizeBox } from "./geometry";
import { tokenInitials } from "./grid";
import { usePortraitPath } from "./portraitPaths";
import { TemplateBody } from "./Templates";
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
  /** Luce ambientale che tinge le immagini; assente con le luci spente. */
  ambient?: LightingSettings["ambient"];
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
  ambient,
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
      ) : item.kind === "template" ? (
        <TemplateContent item={item} cellSize={cellSize} selected={selected} />
      ) : item.kind === "light" ? (
        <LightIcon color={item.color} cellSize={cellSize} selected={selected} />
      ) : (
        <ItemContent item={item} roomId={roomId} ambient={ambient} />
      )}
    </Group>
  );
});

/** Sagoma d'area piazzata: l'origine è il punto del gruppo, la direzione la sua rotazione. */
function TemplateContent({
  item,
  cellSize,
  selected,
}: {
  item: TemplateItem;
  cellSize: number;
  selected: boolean;
}) {
  return (
    <>
      <TemplateBody geometry={item} color={item.color} cell={cellSize} />
      {selected && <Circle radius={6} fill={SELECTION_COLOR} />}
    </>
  );
}

function ItemContent({
  item,
  roomId,
  ambient,
}: {
  item: Exclude<BoardItem, TokenItem | PathItem | LightItem | StampItem | TemplateItem>;
  roomId: string;
  ambient?: LightingSettings["ambient"];
}) {
  switch (item.kind) {
    case "image":
      return <ImageContent item={item} roomId={roomId} ambient={ambient} />;
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

/** Colore per cui si moltiplica un'immagine a seconda della luce: il giorno non la cambia. */
const AMBIENT_TINT: Partial<Record<LightingSettings["ambient"], string>> = {
  twilight: "#d3a9a3",
  night: "#4a5788",
};

/** Copia dell'immagine tinta, con la trasparenza originale. */
function tinted(image: HTMLImageElement, color: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(image, 0, 0);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(image, 0, 0);
  return canvas;
}

function ImageContent({
  item,
  roomId,
  ambient,
}: {
  item: ImageItem;
  roomId: string;
  ambient?: LightingSettings["ambient"];
}) {
  const image = useImage(assetUrl(roomId, item.assetId));
  const tint = ambient ? AMBIENT_TINT[ambient] : undefined;
  const shown = useMemo(() => (image && tint ? tinted(image, tint) : image), [image, tint]);
  if (!shown) {
    return (
      <Rect width={item.width} height={item.height} fill="#8884" stroke="#8888" dash={[8, 8]} />
    );
  }
  return <Image image={shown} width={item.width} height={item.height} />;
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
      {item.aura && (
        <Circle
          radius={r + item.aura.radius * cellSize}
          fill={item.aura.color}
          opacity={0.18}
          stroke={item.aura.color}
          strokeWidth={2}
          dash={[10, 6]}
          listening={false}
        />
      )}
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
        <TokenFace item={item} radius={r} />
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

/** Sagoma della libreria se il token ne ha una già caricata, altrimenti le iniziali. */
function TokenFace({ item, radius }: { item: TokenItem; radius: number }) {
  const data = usePortraitPath(item.portrait);
  if (data) {
    // La sagoma occupa il quadrato 512×512 (gli angoli sono vuoti): 1,5 r sta dentro l'anello.
    const scale = (radius * 1.5) / 512;
    return (
      <Path
        name="portrait"
        data={data}
        x={-256 * scale}
        y={-256 * scale}
        scaleX={scale}
        scaleY={scale}
        fill="#ffffff"
        listening={false}
      />
    );
  }
  return (
    <Text
      text={tokenInitials(item.name)}
      x={-radius}
      y={-radius}
      width={2 * radius}
      height={2 * radius}
      align="center"
      verticalAlign="middle"
      fontFamily={FONT_FAMILY}
      fontStyle="bold"
      fontSize={radius * 0.8}
      fill="#ffffff"
    />
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
