import type { Scene } from "@scryboard/shared";
import { useCallback, useEffect, useState } from "react";
import { api, describeApiError } from "../lib/api";

/** Elenco delle scene (solo GM), riletto quando cambia la scena attiva e dopo ogni modifica. */
export function useScenes(roomId: string, gmToken: string | null, activeScene: string | null) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!gmToken) return;
    try {
      setScenes((await api.scenes.list(roomId, gmToken)).scenes);
    } catch (e) {
      setError(describeApiError(e));
    }
  }, [roomId, gmToken]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: si rilegge anche al cambio di scena attiva.
  useEffect(() => {
    void reload();
  }, [reload, activeScene]);

  /** Esegue una modifica e rilegge l'elenco; l'errore del server si mostra all'utente. */
  const run = useCallback(
    async <T>(action: () => Promise<T>): Promise<T | undefined> => {
      setError(null);
      try {
        const result = await action();
        await reload();
        return result;
      } catch (e) {
        setError(describeApiError(e));
        return undefined;
      }
    },
    [reload],
  );

  return { scenes, error, run };
}
