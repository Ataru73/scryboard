import {
  assetUrl,
  type BoardItem,
  type ConnectorItem,
  type ImageItem,
  isVideoAsset,
  type LightItem,
  type LightingSettings,
  NOTE_ICONS,
  type NoteItem,
  OBSCURED_IDENTITY,
  type PathItem,
  type RoofItem,
  type StampItem,
  type TemplateItem,
  type TokenItem,
} from "@scryboard/shared";
import Konva from "konva";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Arrow,
  Circle,
  Ellipse,
  Group,
  Image,
  Label,
  Line,
  Path,
  Rect,
  Tag,
  Text,
} from "react-konva";
import { PathShape } from "../paths/PathShape";
import { stampImage } from "../stamps/generate";
import { roofTexture, TEXTURE_SIZE } from "../terrain/textures";
import { useAssetAuth } from "./assetAuth";
import { localBox, normalizeBox } from "./geometry";
import { tokenInitials } from "./grid";
import { usePortraitPath } from "./portraitPaths";
import { TemplateBody } from "./Templates";
import { useImage } from "./useImage";
import { ConditionBadges, DownMark, VitalsBar, visibleBand } from "./Vitals";

export const FONT_FAMILY = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
export const LINE_HEIGHT = 1.2;
/** Area cliccabile minima attorno a linee e bordi, in pixel del mondo. */
const HIT_WIDTH = 12;

export const SELECTION_COLOR = "#8e7cf0";
/** Opacità di un tetto con un token sotto. */
export const ROOF_FADED = 0.15;

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
  /** È il turno di questo token. */
  turn?: boolean;
  /** Agganciato a un altro token: mostra il simbolo della catena. */
  attached?: boolean;
  /** Token in incognito: il GM lo vede com'è, con un «?» nell'angolo; gli altri solo la sagoma. */
  unmasked?: boolean;
  /** false: l'oggetto non riceve i clic, che passano a ciò che sta sotto. */
  listening?: boolean;
  /** Opacità di un tetto (sotto c'è un token, o il GM lo vede in trasparenza). */
  fade?: number;
  /** Estremi di un connettore, calcolati dagli oggetti collegati. */
  connectorEnds?: { from: { x: number; y: number }; to: { x: number; y: number } };
  /** Quota del token già formattata («+15 ft»): assente se è a terra. */
  elevationLabel?: string;
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
  turn,
  attached,
  unmasked,
  elevationLabel,
  connectorEnds,
  fade,
  listening = true,
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
      opacity={(editing ? 0 : concealed ? 0.4 : 1) * (fade ?? 1)}
      // Un tetto svanito lascia passare i clic ai token che stanno sotto.
      listening={listening && (fade === undefined || fade >= ROOF_FADED * 2)}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    >
      {item.kind === "token" ? (
        <TokenContent
          item={item}
          roomId={roomId}
          cellSize={cellSize}
          selected={selected}
          turn={turn}
          attached={attached}
          unmasked={unmasked}
          elevationLabel={elevationLabel}
        />
      ) : item.kind === "path" ? (
        <PathShape points={item.points} style={item.style} selected={selected} />
      ) : item.kind === "stamp" ? (
        <StampContent item={item} cellSize={cellSize} selected={selected} />
      ) : item.kind === "template" ? (
        <TemplateContent item={item} cellSize={cellSize} selected={selected} />
      ) : item.kind === "roof" ? (
        <RoofShape item={item} cellSize={cellSize} selected={selected} />
      ) : item.kind === "connector" ? (
        connectorEnds && <ConnectorShape item={item} ends={connectorEnds} selected={selected} />
      ) : item.kind === "note" ? (
        <NotePin item={item} cellSize={cellSize} selected={selected} />
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
  item: Exclude<
    BoardItem,
    | TokenItem
    | PathItem
    | LightItem
    | StampItem
    | TemplateItem
    | NoteItem
    | ConnectorItem
    | RoofItem
  >;
  roomId: string;
  ambient?: LightingSettings["ambient"];
}) {
  switch (item.kind) {
    case "image":
      return isVideoAsset(item.assetId) ? (
        <VideoContent item={item} roomId={roomId} />
      ) : (
        <ImageContent item={item} roomId={roomId} ambient={ambient} />
      );
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

/**
 * Mappa animata: un <video> muto in loop disegnato come immagine. Una `Konva.Animation` ridisegna
 * il livello a ogni fotogramma finché il video è sulla lavagna. Il GM lo scarica con il suo token
 * (un <video> non può inviare header); i giocatori lo leggono a pezzi con le richieste Range.
 */
function VideoContent({ item, roomId }: { item: ImageItem; roomId: string }) {
  const token = useAssetAuth();
  const url = assetUrl(roomId, item.assetId);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const imageRef = useRef<Konva.Image>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const element = document.createElement("video");
    element.muted = true;
    element.loop = true;
    element.autoplay = true;
    element.playsInline = true;
    element.preload = "auto";
    (async () => {
      if (token) {
        const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
        if (!res.ok || cancelled) return;
        objectUrl = URL.createObjectURL(await res.blob());
        element.src = objectUrl;
      } else {
        element.src = url;
      }
      await element.play().catch(() => {});
      if (!cancelled) setVideo(element);
    })().catch(() => {});
    return () => {
      cancelled = true;
      element.pause();
      element.removeAttribute("src");
      element.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, token]);

  useEffect(() => {
    const layer = imageRef.current?.getLayer();
    if (!video || !layer) return;
    const animation = new Konva.Animation(() => {}, layer);
    animation.start();
    return () => {
      animation.stop();
    };
  }, [video]);

  if (!video) {
    return (
      <Rect width={item.width} height={item.height} fill="#8884" stroke="#8888" dash={[8, 8]} />
    );
  }
  return <Image ref={imageRef} image={video} width={item.width} height={item.height} />;
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
  turn,
  attached,
  unmasked,
  elevationLabel,
}: {
  item: TokenItem;
  roomId: string;
  cellSize: number;
  selected: boolean;
  turn?: boolean;
  attached?: boolean;
  unmasked?: boolean;
  elevationLabel?: string;
}) {
  const masked = !!item.obscured && !unmasked;
  const color = masked ? OBSCURED_IDENTITY.color : item.color;
  const r = (item.size * cellSize) / 2;
  const ring = Math.max(2, r * 0.1);
  const labelSize = Math.max(10, cellSize * 0.22);
  // I numeri dei punti ferita (se chi guarda li conosce) solo al passaggio o con il token scelto.
  const [hover, setHover] = useState(false);
  const band = visibleBand(item.hp, item.hpBand);
  const barHeight = Math.max(4, cellSize * 0.08);
  const barY = r + ring / 2 + 3;
  const hpText =
    item.hp && (hover || selected)
      ? `${item.hp.value}/${item.hp.max}${item.hp.temp > 0 ? ` +${item.hp.temp}` : ""}`
      : null;
  // La pillola coi numeri è centrata sulla barra: il nome scende sotto di lei.
  const pillSize = labelSize * 0.85;
  const pillBottom = barY + barHeight / 2 + pillSize * 0.75;
  const nameY = hpText ? pillBottom + 2 : band ? barY + barHeight + 2 : r + 4;
  return (
    <Group onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
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
      {turn && (
        <Circle
          radius={r + ring + 7}
          stroke="#ffc53d"
          strokeWidth={5}
          shadowColor="#ffc53d"
          shadowBlur={14}
          shadowOpacity={0.9}
          listening={false}
          name="turn-ring"
        />
      )}
      {selected && (
        <Circle radius={r + ring + 3} stroke={SELECTION_COLOR} strokeWidth={3} dash={[6, 4]} />
      )}
      <Circle
        radius={r}
        fill={color}
        shadowColor="#000000"
        shadowOpacity={0.35}
        shadowBlur={6}
        shadowOffsetY={2}
      />
      {masked ? (
        <UnknownFace radius={r} />
      ) : item.assetId ? (
        <TokenImage roomId={roomId} assetId={item.assetId} radius={r - ring / 2} />
      ) : (
        <TokenFace item={item} radius={r} />
      )}
      <Circle radius={r - ring / 2} stroke={color} strokeWidth={ring} />
      {band === "down" && <DownMark radius={r - ring} />}
      {item.conditions && (
        <ConditionBadges
          conditions={item.conditions}
          radius={r}
          size={Math.max(16, cellSize * 0.32)}
        />
      )}
      {attached && <ChainBadge x={r * 0.72} y={-r * 0.72} size={Math.max(16, cellSize * 0.3)} />}
      {item.obscured && !masked && (
        <ObscuredBadge x={-r * 0.72} y={-r * 0.72} size={Math.max(16, cellSize * 0.3)} />
      )}
      {elevationLabel && (
        <ElevationPill text={elevationLabel} y={-r - ring} size={labelSize * 0.9} />
      )}
      {band && (
        <VitalsBar
          hp={item.hp}
          band={item.hpBand}
          y={barY}
          width={Math.max(cellSize * 0.6, r * 1.5)}
          height={barHeight}
        />
      )}
      {item.name && !masked && (
        <Text
          text={item.name}
          x={-cellSize * 2}
          y={nameY}
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
      {hpText && (
        <ElevationPill
          text={hpText}
          // ElevationPill si mette sopra al punto dato: si passa il fondo della pillola.
          y={pillBottom}
          size={pillSize}
          name="hp-text"
        />
      )}
    </Group>
  );
}

/** Piccolo simbolo di catena in un angolo del token: è agganciato a un altro. */
function ChainBadge({ x, y, size }: { x: number; y: number; size: number }) {
  const scale = (size * 0.6) / 24;
  return (
    <Group x={x} y={y} listening={false} name="chain-badge">
      <Circle radius={size / 2} fill="#1d1a24" stroke="#ffffff" strokeWidth={1.5} />
      <Path
        data="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
        x={-12 * scale}
        y={-12 * scale}
        scaleX={scale}
        scaleY={scale}
        stroke="#ffffff"
        strokeWidth={2.4}
        lineCap="round"
        lineJoin="round"
      />
    </Group>
  );
}

/** Pillola con un'etichetta (quota, punti ferita), centrata sopra il punto `y`. */
function ElevationPill({
  text,
  y,
  size,
  name = "elevation-badge",
}: {
  text: string;
  y: number;
  size: number;
  name?: string;
}) {
  const width = text.length * size * 0.62 + size;
  const height = size * 1.5;
  return (
    <Group y={y - height / 2} listening={false} name={name}>
      <Rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        cornerRadius={height / 2}
        fill="#1d1a24"
        stroke="#ffffff"
        strokeWidth={1.5}
      />
      <Text
        text={text}
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        align="center"
        verticalAlign="middle"
        fontFamily={FONT_FAMILY}
        fontStyle="bold"
        fontSize={size}
        fill="#ffffff"
      />
    </Group>
  );
}

/** Token in incognito visto dai giocatori: una sagoma scura con un punto di domanda. */
function UnknownFace({ radius }: { radius: number }) {
  const head = radius * 0.34;
  return (
    <Group
      name="obscured-face"
      listening={false}
      clipFunc={(ctx) => ctx.arc(0, 0, radius * 0.92, 0, Math.PI * 2)}
    >
      <Ellipse y={radius * 0.72} radiusX={radius * 0.62} radiusY={radius * 0.42} fill="#1d1a24" />
      <Circle y={-radius * 0.18} radius={head} fill="#1d1a24" />
      <Text
        text="?"
        x={-head}
        y={-radius * 0.18 - head}
        width={2 * head}
        height={2 * head}
        align="center"
        verticalAlign="middle"
        fontFamily={FONT_FAMILY}
        fontStyle="bold"
        fontSize={head * 1.3}
        fill="#d8d2e6"
      />
    </Group>
  );
}

/** «?» in un angolo del token: è in incognito per i giocatori (lo vede solo il GM). */
function ObscuredBadge({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <Group x={x} y={y} listening={false} name="obscured-badge">
      <Circle radius={size / 2} fill="#8e4ec6" stroke="#ffffff" strokeWidth={1.5} />
      <Text
        text="?"
        x={-size / 2}
        y={-size / 2}
        width={size}
        height={size}
        align="center"
        verticalAlign="middle"
        fontFamily={FONT_FAMILY}
        fontStyle="bold"
        fontSize={size * 0.7}
        fill="#ffffff"
      />
    </Group>
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

/** Tetto procedurale: il poligono riempito con la texture dello stile, a scala della griglia. */
function RoofShape({
  item,
  cellSize,
  selected,
}: {
  item: RoofItem;
  cellSize: number;
  selected: boolean;
}) {
  // Una texture copre due caselle: tegole e lastre restano proporzionate ai token.
  const scale = (cellSize * 2) / TEXTURE_SIZE;
  const box = localBox(item, cellSize);
  // Il colmo corre lungo il lato lungo: una falda in luce e una in ombra.
  const across =
    box.width >= box.height
      ? { start: { x: 0, y: box.y }, end: { x: 0, y: box.y + box.height } }
      : { start: { x: box.x, y: 0 }, end: { x: box.x + box.width, y: 0 } };
  return (
    <>
      <Line
        points={item.points}
        closed
        fillPatternImage={roofTexture(item.style) as unknown as HTMLImageElement}
        fillPatternRepeat="repeat"
        fillPatternScale={{ x: scale, y: scale }}
        stroke={selected ? SELECTION_COLOR : "#2b1d14"}
        strokeWidth={selected ? 3 : Math.max(2, cellSize * 0.06)}
        dash={selected ? [8, 5] : undefined}
        lineJoin="round"
        shadowColor="#000000"
        shadowOpacity={0.45}
        shadowBlur={cellSize * 0.25}
        shadowOffsetY={cellSize * 0.06}
      />
      <Line
        points={item.points}
        closed
        listening={false}
        fillLinearGradientStartPoint={across.start}
        fillLinearGradientEndPoint={across.end}
        fillLinearGradientColorStops={[
          0,
          "rgba(255, 255, 255, 0.16)",
          0.495,
          "rgba(255, 255, 255, 0.02)",
          0.505,
          "rgba(0, 0, 0, 0.22)",
          1,
          "rgba(0, 0, 0, 0.1)",
        ]}
      />
    </>
  );
}

/** Freccia tra due oggetti, con l'etichetta a metà. */
function ConnectorShape({
  item,
  ends,
  selected,
}: {
  item: ConnectorItem;
  ends: { from: { x: number; y: number }; to: { x: number; y: number } };
  selected: boolean;
}) {
  const points = [ends.from.x, ends.from.y, ends.to.x, ends.to.y];
  const head = Math.max(8, item.strokeWidth * 3);
  const fontSize = Math.max(12, item.strokeWidth * 4);
  return (
    <>
      {selected && (
        <Line
          points={points}
          stroke={SELECTION_COLOR}
          strokeWidth={item.strokeWidth + 6}
          opacity={0.5}
          lineCap="round"
          listening={false}
        />
      )}
      <Arrow
        points={points}
        stroke={item.color}
        fill={item.color}
        strokeWidth={item.strokeWidth}
        pointerLength={item.arrow ? head : 0}
        pointerWidth={item.arrow ? head : 0}
        lineCap="round"
        hitStrokeWidth={Math.max(HIT_WIDTH, item.strokeWidth + 8)}
      />
      {item.label && (
        <Label
          x={(ends.from.x + ends.to.x) / 2}
          y={(ends.from.y + ends.to.y) / 2}
          // Centrata sul punto medio: la larghezza del testo è stimata.
          offsetX={(item.label.length * fontSize * 0.55 + fontSize * 0.6) / 2}
          offsetY={fontSize * 0.8}
          listening={false}
        >
          <Tag fill="#1d1a24" opacity={0.85} cornerRadius={4} />
          <Text
            text={item.label}
            fontFamily={FONT_FAMILY}
            fontSize={fontSize}
            padding={fontSize * 0.3}
            fill="#ffffff"
          />
        </Label>
      )}
    </>
  );
}

/** Simboli dei pin delle note, tracciati in un quadrato 24×24. */
export const NOTE_GLYPHS: Record<NoteItem["icon"], string> = {
  note: "M7 4h7l3 3v13H7z M10 10h4 M10 14h4",
  trap: "M12 4l9 16H3z M12 10v4 M12 17h.01",
  treasure: "M4 11h16v8H4z M4 11a8 5 0 0116 0 M11 14h2v2h-2z",
  secret: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z",
  npc: "M12 4a4 4 0 100 8 4 4 0 000-8z M4 21a8 8 0 0116 0",
};

/** Pin di una nota: un disco del colore dell'icona, con il titolo sotto. */
function NotePin({
  item,
  cellSize,
  selected,
}: {
  item: NoteItem;
  cellSize: number;
  selected: boolean;
}) {
  const r = cellSize * 0.28;
  const color = NOTE_ICONS.find((i) => i.id === item.icon)?.color ?? "#8e4ec6";
  const scale = (r * 1.15) / 24;
  const labelSize = Math.max(9, cellSize * 0.18);
  return (
    <>
      {selected && (
        <Circle radius={r * 1.45} stroke={SELECTION_COLOR} strokeWidth={2} dash={[5, 3]} />
      )}
      <Circle
        radius={r}
        fill={color}
        stroke="#ffffff"
        strokeWidth={Math.max(1.5, r * 0.12)}
        shadowColor="#000000"
        shadowOpacity={0.35}
        shadowBlur={5}
        shadowOffsetY={2}
      />
      <Path
        name="note-glyph"
        data={NOTE_GLYPHS[item.icon]}
        x={-12 * scale}
        y={-12 * scale}
        scaleX={scale}
        scaleY={scale}
        stroke="#ffffff"
        strokeWidth={2.2}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />
      {item.title && (
        <Text
          text={item.title}
          x={-cellSize * 2}
          y={r + 3}
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
