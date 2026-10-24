import { useEffect, useState } from "react";

const cache = new Map<string, HTMLImageElement>();

/** Carica un'immagine una sola volta per URL e la riusa tra i nodi. */
export function useImage(url: string): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(() => {
    const cached = cache.get(url);
    return cached?.complete ? cached : null;
  });

  useEffect(() => {
    let img = cache.get(url);
    if (!img) {
      img = new Image();
      img.decoding = "async";
      img.src = url;
      cache.set(url, img);
    }
    if (img.complete && img.naturalWidth > 0) {
      setImage(img);
      return;
    }
    const current = img;
    const onLoad = () => setImage(current);
    current.addEventListener("load", onLoad);
    return () => current.removeEventListener("load", onLoad);
  }, [url]);

  return image;
}
