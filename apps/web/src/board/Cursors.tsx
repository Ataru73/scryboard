import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { PresenceUser } from "@scryboard/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Group, Label, Path, Tag, Text } from "react-konva";
import type { Point } from "./viewport";

interface RemoteCursor {
  clientId: number;
  user: PresenceUser;
  position: Point;
}

const BROADCAST_INTERVAL_MS = 50;

/** Pubblica la posizione del puntatore (in coordinate mondo) nell'awareness, al massimo ogni 50 ms. */
export function useCursorBroadcast(provider: HocuspocusProvider) {
  const last = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Point | null>(null);

  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );

  return useCallback(
    (position: Point | null) => {
      latest.current = position;
      const send = () => {
        pending.current = null;
        last.current = Date.now();
        provider.setAwarenessField("cursor", latest.current);
      };
      if (position === null) {
        if (pending.current) clearTimeout(pending.current);
        send();
        return;
      }
      if (pending.current) return;
      const wait = BROADCAST_INTERVAL_MS - (Date.now() - last.current);
      if (wait <= 0) send();
      else pending.current = setTimeout(send, wait);
    },
    [provider],
  );
}

/** Puntatori degli altri utenti; dimensione costante a qualsiasi livello di zoom. */
export function Cursors({ provider, scale }: { provider: HocuspocusProvider; scale: number }) {
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);

  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    const update = () => {
      const next: RemoteCursor[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID || !state.user || !state.cursor) return;
        next.push({ clientId, user: state.user as PresenceUser, position: state.cursor as Point });
      });
      setCursors(next);
    };
    update();
    awareness.on("change", update);
    return () => awareness.off("change", update);
  }, [provider]);

  return (
    <>
      {cursors.map(({ clientId, user, position }) => (
        <Group key={clientId} x={position.x} y={position.y} scaleX={1 / scale} scaleY={1 / scale}>
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
      ))}
    </>
  );
}
