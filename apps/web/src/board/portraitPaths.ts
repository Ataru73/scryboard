import { useEffect, useState } from "react";

type PortraitPaths = Record<string, string>;

let loaded: PortraitPaths | null = null;
let loading: Promise<PortraitPaths> | null = null;

/** Scarica i tracciati della libreria (un chunk a parte) la prima volta che servono. */
export function loadPortraitPaths(): Promise<PortraitPaths> {
  loading ??= import("./portraits.gen").then(
    (m) => {
      loaded = m.PORTRAIT_PATHS;
      return loaded;
    },
    (err) => {
      // Un errore di rete non resta in cache: si riprova al prossimo uso.
      loading = null;
      throw err;
    },
  );
  return loading;
}

/**
 * Tracciato di un'immagine della libreria. È null finché il chunk non è scaricato e per gli id
 * sconosciuti (immagine rimossa o client più vecchio): il token mostra le iniziali.
 */
export function usePortraitPath(id: string | null | undefined): string | null {
  const [paths, setPaths] = useState<PortraitPaths | null>(loaded);

  useEffect(() => {
    if (!id || paths) return;
    let cancelled = false;
    loadPortraitPaths().then(
      (p) => {
        if (!cancelled) setPaths(p);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [id, paths]);

  return id && paths && Object.hasOwn(paths, id) ? (paths[id] ?? null) : null;
}
