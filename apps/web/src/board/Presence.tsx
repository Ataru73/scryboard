import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { GridSettings, PresenceUser, TokenItem } from "@scryboard/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, Group, Label, Line, Path, Tag, Text } from "react-konva";
import type { TemplateGeometry } from "./areas";
import { RulerShape, type RulerState } from "./Ruler";
import { AreaPreview } from "./Templates";
import type { Point } from "./viewport";

/** Tratto a mano libera ancora in corso, condiviso per mostrarlo mentre lo si disegna. */
export interface DraftStroke {
  origin: Point;
  points: number[];
  color: string;
  strokeWidth: number;
}

export interface Ping {
  id: string;
  x: number;
  y: number;
}

const BROADCAST_INTERVAL_MS = 50;
const PING_DURATION_MS = 1800;

/**
 * Pubblica un campo dell'awareness al massimo ogni 50 ms; null viene inviato subito
 * (es. il cursore esce dalla lavagna, il tratto è finito).
 */
export function useAwarenessBroadcast<T>(provider: HocuspocusProvider, field: string) {
  const last = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<T | null>(null);

  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );

  return useCallback(
    (value: T | null) => {
      latest.current = value;
      const send = () => {
        pending.current = null;
        last.current = Date.now();
        provider.setAwarenessField(field, latest.current);
      };
      if (value === null) {
        if (pending.current) clearTimeout(pending.current);
        send();
        return;
      }
      if (pending.current) return;
      const wait = BROADCAST_INTERVAL_MS - (Date.now() - last.current);
      if (wait <= 0) send();
      else pending.current = setTimeout(send, wait);
    },
    [provider, field],
  );
}

interface RemoteState {
  clientId: number;
  isSelf: boolean;
  user: PresenceUser;
  cursor: Point | null;
  draft: DraftStroke | null;
  ping: Ping | null;
  ruler: RulerState | null;
  template: TemplateGeometry | null;
}

interface ActivePing extends Ping {
  color: string;
  name: string;
  start: number;
}

/**
 * Presenza degli altri: puntatori, tratti in corso e ping (anche i propri). Puntatori e ping
 * hanno dimensione costante a qualsiasi zoom.
 */
export function Presence({
  provider,
  scale,
  grid,
  tokens,
}: {
  provider: HocuspocusProvider;
  scale: number;
  grid: GridSettings;
  /** Token che chi guarda può vedere: quelli toccati da una sagoma si evidenziano. */
  tokens: TokenItem[];
}) {
  const [states, setStates] = useState<RemoteState[]>([]);
  const [pings, setPings] = useState<ActivePing[]>([]);
  const seenPings = useRef(new Set<string>());
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    const update = () => {
      const next: RemoteState[] = [];
      const fresh: ActivePing[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (!state.user) return;
        const user = state.user as PresenceUser;
        const ping = (state.ping as Ping | null) ?? null;
        if (ping && !seenPings.current.has(ping.id)) {
          seenPings.current.add(ping.id);
          fresh.push({ ...ping, color: user.color, name: user.name, start: performance.now() });
        }
        next.push({
          clientId,
          isSelf: clientId === awareness.clientID,
          user,
          cursor: (state.cursor as Point | null) ?? null,
          draft: (state.draft as DraftStroke | null) ?? null,
          ping,
          ruler: (state.ruler as RulerState | null) ?? null,
          template: (state.template as TemplateGeometry | null) ?? null,
        });
      });
      setStates(next);
      if (fresh.length > 0) setPings((current) => [...current, ...fresh]);
    };
    update();
    awareness.on("change", update);
    return () => awareness.off("change", update);
  }, [provider]);

  // Anima i ping finché ce n'è almeno uno attivo.
  useEffect(() => {
    if (pings.length === 0) return;
    let frame = requestAnimationFrame(function tick(t) {
      setNow(t);
      setPings((current) => current.filter((p) => t - p.start < PING_DURATION_MS));
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [pings.length]);

  const others = states.filter((s) => !s.isSelf);
  return (
    <>
      {others.map(
        ({ clientId, draft }) =>
          draft && (
            <Line
              key={`draft-${clientId}`}
              x={draft.origin.x}
              y={draft.origin.y}
              points={draft.points}
              stroke={draft.color}
              strokeWidth={draft.strokeWidth}
              opacity={0.6}
              lineCap="round"
              lineJoin="round"
              tension={0.4}
              name="draft"
            />
          ),
      )}
      {others.map(
        ({ clientId, user, ruler }) =>
          ruler && (
            <RulerShape
              key={`ruler-${clientId}`}
              points={ruler.points}
              color={user.color}
              grid={grid}
              scale={scale}
            />
          ),
      )}
      {others.map(
        ({ clientId, user, template }) =>
          template && (
            <AreaPreview
              key={`template-${clientId}`}
              geometry={template}
              color={user.color}
              grid={grid}
              tokens={tokens}
              scale={scale}
            />
          ),
      )}
      {pings.map((ping) => {
        const progress = Math.min(1, Math.max(0, (now - ping.start) / PING_DURATION_MS));
        return (
          <Group
            key={ping.id}
            name="ping"
            x={ping.x}
            y={ping.y}
            scaleX={1 / scale}
            scaleY={1 / scale}
          >
            <Circle
              radius={8 + progress * 52}
              stroke={ping.color}
              strokeWidth={4}
              opacity={1 - progress}
            />
            <Circle
              radius={8 + progress * 26}
              stroke={ping.color}
              strokeWidth={3}
              opacity={(1 - progress) * 0.7}
            />
            <Circle radius={6} fill={ping.color} opacity={1 - progress * 0.5} />
          </Group>
        );
      })}
      {others.map(
        ({ clientId, user, cursor }) =>
          cursor && (
            <Group key={clientId} x={cursor.x} y={cursor.y} scaleX={1 / scale} scaleY={1 / scale}>
              <Path
                data="M0 0 L0 16 L4.5 12 L8 19 L10.5 18 L7 11 L13 11 Z"
                fill={user.color}
                stroke="#ffffff"
                strokeWidth={1.2}
              />
              <Label x={12} y={18}>
                <Tag fill={user.color} cornerRadius={4} />
                <Text text={user.name} fontSize={12} padding={4} fill="#ffffff" fontStyle="bold" />
              </Label>
            </Group>
          ),
      )}
    </>
  );
}
