import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { PresenceUser } from "@scryboard/shared";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Ping } from "./Presence";
import { edgeIndicator, type Point, type Viewport, worldToScreen } from "./viewport";

/** Quanto resta la freccia di un ping fuori vista. */
const ARROW_MS = 5000;

interface OffscreenPing extends Ping {
  name: string;
  color: string;
}

interface Props {
  provider: HocuspocusProvider;
  viewport: Viewport;
  size: { width: number; height: number };
  /** Porta la vista sul punto del ping. */
  onFocus: (world: Point) => void;
}

/**
 * Frecce sul bordo dello schermo verso i ping degli altri che cadono fuori vista; un clic
 * porta la vista sul punto. I ping visibili hanno già il loro cerchio animato.
 */
export function PingArrows({ provider, viewport, size, onFocus }: Props) {
  const { t } = useTranslation();
  const [pings, setPings] = useState<OffscreenPing[]>([]);

  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    const seen = new Set<string>();
    // I ping già presenti quando si entra sono vecchi: si ricordano senza mostrarli.
    for (const state of awareness.getStates().values()) {
      const ping = state.ping as Ping | null | undefined;
      if (ping) seen.add(ping.id);
    }
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const onChange = () => {
      awareness.getStates().forEach((state, clientId) => {
        const ping = state.ping as Ping | null | undefined;
        const user = state.user as PresenceUser | undefined;
        if (!ping || !user || clientId === awareness.clientID || seen.has(ping.id)) return;
        seen.add(ping.id);
        setPings((current) => [...current, { ...ping, name: user.name, color: user.color }]);
        const timer = setTimeout(() => {
          timers.delete(timer);
          setPings((current) => current.filter((p) => p.id !== ping.id));
        }, ARROW_MS);
        timers.add(timer);
      });
    };
    awareness.on("change", onChange);
    return () => {
      awareness.off("change", onChange);
      for (const timer of timers) clearTimeout(timer);
    };
  }, [provider]);

  return (
    <>
      {pings.map((ping) => {
        const edge = edgeIndicator(worldToScreen(viewport, ping), size);
        if (!edge) return null;
        return (
          <button
            key={ping.id}
            type="button"
            className="ping-arrow"
            style={{
              left: edge.position.x,
              top: edge.position.y,
              background: ping.color,
              transform: `translate(-50%, -50%) rotate(${edge.angle}deg)`,
            }}
            aria-label={t("effects.ping.offscreenLabel", { name: ping.name })}
            title={t("effects.ping.title", { name: ping.name })}
            onClick={() => onFocus(ping)}
          >
            <span aria-hidden="true">➤</span>
          </button>
        );
      })}
    </>
  );
}
