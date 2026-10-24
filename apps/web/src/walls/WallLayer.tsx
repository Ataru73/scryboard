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
} as const;

interface Props {
  walls: Wall[];
  /** Nebbia ordinata per seq: ai giocatori si nascondono le porte coperte. */
  fog: FogOp[];
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
                    : undefined
                }
                lineCap="round"
                lineJoin="round"
              />
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
          {wall.kind === "door" && (role === "gm" || !isDoorFogged(wall, fog)) && (
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
