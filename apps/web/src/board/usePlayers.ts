import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { PresenceUser } from "@scryboard/shared";
import { useEffect, useState } from "react";

/**
 * Giocatori connessi (con l'id del profilo), per assegnare token e per l'anteprima del GM. Lo
 * schermo condiviso non è un giocatore.
 */
export function usePlayers(provider: HocuspocusProvider): (PresenceUser & { id: string })[] {
  const [players, setPlayers] = useState<(PresenceUser & { id: string })[]>([]);
  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    let key = "";
    const update = () => {
      const byId = new Map<string, PresenceUser & { id: string }>();
      awareness.getStates().forEach((state) => {
        const user = state.user as PresenceUser | undefined;
        if (user?.id && user.role === "player" && !user.projector)
          byId.set(user.id, { ...user, id: user.id });
      });
      const next = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
      // L'awareness cambia a ogni movimento dei cursori: si aggiorna solo se la lista cambia.
      const nextKey = JSON.stringify(next);
      if (nextKey !== key) {
        key = nextKey;
        setPlayers(next);
      }
    };
    update();
    awareness.on("change", update);
    return () => awareness.off("change", update);
  }, [provider]);
  return players;
}
