import {
  conditionKey,
  type HitPoints,
  type HpBand,
  hpBandOf,
  type TokenCondition,
} from "@scryboard/shared";
import { Circle, Group, Line, Path, Rect, Text } from "react-konva";
import { CONDITION_ICONS, conditionColor, conditionInitial } from "./conditionIcons";
import { FONT_FAMILY } from "./ItemNode";

/** Colore della barra per ogni fascia. */
export const HP_BAND_COLORS: Record<HpBand, string> = {
  healthy: "#46a758",
  wounded: "#ffc53d",
  bloodied: "#f76b15",
  down: "#e5484d",
};

/** Riempimento della barra a scatti, per chi vede solo la fascia. */
const BAND_FILL: Record<HpBand, number> = { healthy: 1, wounded: 0.75, bloodied: 0.4, down: 0 };

/** Fascia mostrata sul token: dai numeri se chi guarda li conosce, altrimenti quella pubblica. */
export function visibleBand(hp: HitPoints | null | undefined, band: HpBand | undefined) {
  return hp ? hpBandOf(hp) : band;
}

/**
 * Barra dei punti ferita, centrata sotto il token: proporzionale se chi guarda conosce i numeri,
 * a scatti se vede solo la fascia. I temporanei sono un tratto azzurro in coda.
 */
export function VitalsBar({
  hp,
  band,
  y,
  width,
  height,
}: {
  hp: HitPoints | null | undefined;
  band: HpBand | undefined;
  y: number;
  width: number;
  height: number;
}) {
  const shown = visibleBand(hp, band);
  if (!shown) return null;
  const total = hp ? hp.max + hp.temp : 1;
  const fill = hp ? Math.max(0, Math.min(hp.value, hp.max)) / total : BAND_FILL[shown];
  const temp = hp ? hp.temp / total : 0;
  return (
    <Group y={y} listening={false} name="hp-bar">
      <Rect
        x={-width / 2}
        width={width}
        height={height}
        cornerRadius={height / 2}
        fill="#1d1a24"
        stroke="#ffffff"
        strokeWidth={1}
      />
      {fill > 0 && (
        <Rect
          x={-width / 2}
          width={width * fill}
          height={height}
          cornerRadius={height / 2}
          fill={HP_BAND_COLORS[shown]}
        />
      )}
      {temp > 0 && (
        <Rect
          x={-width / 2 + width * fill}
          width={width * temp}
          height={height}
          cornerRadius={height / 2}
          fill="#70b8ff"
        />
      )}
    </Group>
  );
}

/** Velo scuro e croce rossa: il token è a 0 punti ferita o meno. */
export function DownMark({ radius }: { radius: number }) {
  const arm = radius * 0.45;
  return (
    <Group listening={false} name="down-mark">
      <Circle radius={radius} fill="#1d1a24" opacity={0.5} />
      <Line
        points={[-arm, -arm, arm, arm]}
        stroke="#e5484d"
        strokeWidth={radius * 0.16}
        lineCap="round"
      />
      <Line
        points={[arm, -arm, -arm, arm]}
        stroke="#e5484d"
        strokeWidth={radius * 0.16}
        lineCap="round"
      />
    </Group>
  );
}

/**
 * Angoli (in gradi, y verso il basso) delle icone sul bordo: ai fianchi, poi un po' più in basso.
 * Gli angoli in alto sono di catena e incognito, il fondo di barra e numeri dei PF.
 */
const BADGE_ANGLES = [180, 0, 145, 35];

/** Icone delle condizioni sui fianchi del token; oltre quattro, «+N» nell'ultima. */
export function ConditionBadges({
  conditions,
  radius,
  size,
}: {
  conditions: readonly TokenCondition[];
  radius: number;
  size: number;
}) {
  if (conditions.length === 0) return null;
  const overflow = conditions.length > BADGE_ANGLES.length;
  const shown = overflow ? conditions.slice(0, BADGE_ANGLES.length - 1) : conditions;
  const scale = (size * 0.62) / 24;
  const at = (index: number) => {
    const angle = ((BADGE_ANGLES[index] as number) * Math.PI) / 180;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  };
  return (
    <>
      {shown.map((condition, index) => (
        <Group
          key={conditionKey(condition)}
          {...at(index)}
          listening={false}
          name="condition-badge"
        >
          <Circle radius={size / 2} fill="#1d1a24" stroke="#ffffff" strokeWidth={1.5} />
          {condition.id === "custom" ? (
            // Le personalizzate non hanno un'icona: l'iniziale nel loro colore.
            <Text
              text={conditionInitial(condition.label)}
              x={-size / 2}
              y={-size / 2}
              width={size}
              height={size}
              align="center"
              verticalAlign="middle"
              fontFamily={FONT_FAMILY}
              fontStyle="bold"
              fontSize={size * 0.55}
              fill={condition.color}
            />
          ) : (
            <Path
              data={CONDITION_ICONS[condition.id].path}
              x={-12 * scale}
              y={-12 * scale}
              scaleX={scale}
              scaleY={scale}
              stroke={conditionColor(condition)}
              strokeWidth={2.6}
              dash={CONDITION_ICONS[condition.id].dash ? [3, 2.5] : undefined}
              lineCap="round"
              lineJoin="round"
            />
          )}
        </Group>
      ))}
      {overflow && (
        <Group {...at(BADGE_ANGLES.length - 1)} listening={false} name="condition-badge">
          <Circle radius={size / 2} fill="#1d1a24" stroke="#ffffff" strokeWidth={1.5} />
          <Text
            text={`+${conditions.length - shown.length}`}
            x={-size / 2}
            y={-size / 2}
            width={size}
            height={size}
            align="center"
            verticalAlign="middle"
            fontFamily={FONT_FAMILY}
            fontStyle="bold"
            fontSize={size * 0.5}
            fill="#ffffff"
          />
        </Group>
      )}
    </>
  );
}
