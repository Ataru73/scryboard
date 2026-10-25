import {
  type Door,
  doorCenter,
  type FogOp,
  isDoorFogged,
  type Role,
  type Wall,
} from "@scryboard/shared";
import type Konva from "konva";
import { Circle, Group, Line, Rect } from "react-konva";
import { SELECTION_COLOR } from "../board/ItemNode";

const WALL_COLORS = {
  wall: "#494155",
  door: "#9c6b30",
  window: "#36a3b8",
  invisible: "#8e7cf0",
  "one-way": "#d9822b",
  terrain: "#7a6a55",
} as const;

interface Props {
  walls: Wall[];
  /** Nebbia ordinata per seq: ai giocatori si nascondono le porte coperte. */
  fog: FogOp[];
  /** Visione dinamica del giocatore: le porte al buio non si vedono né si aprono. */
  isDoorVisible: (door: Door) => boolean;
  role: Role;
  scale: number;
  selectedWallId: string | null;
  /** Le icone sono attive con Seleziona; con gli altri strumenti il clic arriva alla lavagna. */
  interactive: boolean;
  onToggleDoor: (door: Door) => void;
}

/**
 * Muri visibili solo al GM; ai giocatori arrivano sullo schermo soltanto le icone delle porte, e
 * nemmeno quelle coperte dalla nebbia (che altrimenti si potrebbero aprire cliccando alla cieca).
 */
export function WallLayer({
  walls,
  fog,
  isDoorVisible,
  role,
  scale,
  selectedWallId,
  interactive,
  onToggleDoor,
}: Props) {
  return (
    <>
      {walls.map((wall) => (
        <Group key={wall.id} id={wall.id} name="wall">
          {role === "gm" && (
            <>
              <Line
                name={`wall-line wall-${wall.kind}`}
                points={wall.points}
                stroke={WALL_COLORS[wall.kind]}
                strokeWidth={(wall.kind === "invisible" ? 3 : 5) / scale}
                hitStrokeWidth={14 / scale}
                opacity={wall.kind === "invisible" ? 0.65 : 1}
                dash={
                  wall.kind === "invisible" || (wall.kind === "door" && wall.door === "open")
                    ? [10 / scale, 7 / scale]
                    : wall.kind === "terrain"
                      ? [14 / scale, 5 / scale]
                      : undefined
                }
                lineCap="round"
                lineJoin="round"
              />
              {wall.kind === "one-way" && <OneWayArrows points={wall.points} scale={scale} />}
              {selectedWallId === wall.id && (
                <Line
                  points={wall.points}
                  stroke={SELECTION_COLOR}
                  strokeWidth={2 / scale}
                  dash={[7 / scale, 5 / scale]}
                  listening={false}
                />
              )}
            </>
          )}
          {wall.kind === "door" &&
            (role === "gm" || (!isDoorFogged(wall, fog) && isDoorVisible(wall))) && (
              <DoorIcon
                door={wall}
                scale={scale}
                interactive={interactive}
                onToggle={() => onToggleDoor(wall)}
              />
            )}
        </Group>
      ))}
    </>
  );
}

/**
 * Frecce a metà di ogni tratto di un muro a senso unico: puntano nel verso in cui si vede
 * attraverso, cioè dal lato sinistro di chi percorre la polilinea (il lato trasparente) a destra.
 */
function OneWayArrows({ points, scale }: { points: number[]; scale: number }) {
  const arrows: { x: number; y: number; angle: number }[] = [];
  for (let i = 0; i + 3 < points.length; i += 2) {
    const ax = points[i] as number;
    const ay = points[i + 1] as number;
    const bx = points[i + 2] as number;
    const by = points[i + 3] as number;
    // Normale destra in coordinate con y verso il basso: (−dy, dx).
    const angle = (Math.atan2(bx - ax, -(by - ay)) * 180) / Math.PI;
    arrows.push({ x: (ax + bx) / 2, y: (ay + by) / 2, angle });
  }
  return (
    <>
      {arrows.map((arrow, index) => (
        <Group
          // biome-ignore lint/suspicious/noArrayIndexKey: i tratti non hanno un id.
          key={index}
          x={arrow.x}
          y={arrow.y}
          rotation={arrow.angle}
          scaleX={1 / scale}
          scaleY={1 / scale}
          listening={false}
        >
          <Line
            points={[-9, 0, 9, 0, 4, -5, 9, 0, 4, 5]}
            stroke="#d9822b"
            strokeWidth={2.5}
            lineCap="round"
            lineJoin="round"
          />
        </Group>
      ))}
    </>
  );
}

function DoorIcon({
  door,
  scale,
  interactive,
  onToggle,
}: {
  door: Door;
  scale: number;
  interactive: boolean;
  onToggle: () => void;
}) {
  const { x, y } = doorCenter(door);
  const fill = door.door === "open" ? "#2f7d4f" : door.door === "locked" ? "#a33f46" : "#9c6b30";
  const handle = (event: Konva.KonvaEventObject<PointerEvent>) => {
    if (!interactive || event.evt.button !== 0) return;
    event.cancelBubble = true;
    onToggle();
  };
  return (
    <Group
      id={`door-${door.id}`}
      name={`door-icon door-${door.door}`}
      x={x}
      y={y}
      scale={{ x: 1 / scale, y: 1 / scale }}
      onPointerDown={handle}
    >
      <Rect x={-14} y={-14} width={28} height={28} fill="transparent" />
      <Circle radius={11} fill={fill} stroke="#ffffff" strokeWidth={1.5} />
      {door.door === "locked" ? (
        <>
          <Rect x={-5} y={-1} width={10} height={8} cornerRadius={1} fill="#ffffff" />
          <Line
            points={[-3.5, -1, -3.5, -4, -2.5, -6, 0, -7, 2.5, -6, 3.5, -4, 3.5, -1]}
            stroke="#ffffff"
            strokeWidth={1.8}
          />
          <Circle y={3} radius={1.1} fill={fill} />
        </>
      ) : door.door === "open" ? (
        <Line
          points={[-5, 7, -5, -7, 5, -3, 5, 7, -5, 7]}
          stroke="#ffffff"
          strokeWidth={1.8}
          lineJoin="round"
        />
      ) : (
        <>
          <Rect x={-5} y={-7} width={10} height={14} stroke="#ffffff" strokeWidth={1.8} />
          <Circle x={2.5} radius={1.1} fill="#ffffff" />
        </>
      )}
    </Group>
  );
}
