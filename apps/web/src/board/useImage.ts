import { useEffect, useState } from "react";
import { useAssetAuth } from "./assetAuth";

const cache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Impossibile caricare ${src}`));
    img.src = src;
  });
}

/**
 * Il GM scarica le immagini con il suo token (un <img> non può inviare header), così vede anche
 * quelle degli oggetti nascosti; i giocatori le caricano direttamente.
 */
async function fetchImage(url: string, token: string | null): Promise<HTMLImageElement> {
  if (!token) return loadImage(url);
  const authorization = token.includes(":") ? `Player ${token}` : `Bearer ${token}`;
  const res = await fetch(url, { headers: { authorization } });
  if (!res.ok) throw new Error(`Immagine non disponibile (${res.status})`);
  return loadImage(URL.createObjectURL(await res.blob()));
}

/** Carica un'immagine una sola volta per URL e la riusa tra i nodi. */
export function useImage(url: string): HTMLImageElement | null {
  const token = useAssetAuth();
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const key = `${token ? "gm" : "public"}:${url}`;
    let promise = cache.get(key);
    if (!promise) {
      promise = fetchImage(url, token);
      cache.set(key, promise);
      // Un errore (es. immagine non ancora rivelata) non resta in cache: si riprova al prossimo uso.
      promise.catch(() => cache.delete(key));
    }
    promise.then(
      (img) => {
        if (!cancelled) setImage(img);
      },
      () => {
        if (!cancelled) setImage(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url, token]);

  return image;
}
