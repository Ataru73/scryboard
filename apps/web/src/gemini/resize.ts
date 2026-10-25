import type { GeneratedImage } from "./api";

const SIDE = 512;

/** Ritaglia al centro un quadrato e lo riduce a 512×512 in WebP, pronto da caricare come asset. */
export async function toTokenImage(image: GeneratedImage): Promise<File> {
  const bytes = Uint8Array.from(atob(image.data), (c) => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: image.mimeType }));
  const canvas = document.createElement("canvas");
  canvas.width = SIDE;
  canvas.height = SIDE;
  const side = Math.min(bitmap.width, bitmap.height);
  canvas
    .getContext("2d")
    ?.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      SIDE,
      SIDE,
    );
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.9),
  );
  if (!blob) throw new Error("Impossibile ridurre l'immagine.");
  return new File([blob], "token.webp", { type: "image/webp" });
}

const MAP_MAX_SIDE = 2048;

/** Riduce una mappa generata a 2048 px sul lato lungo, in WebP: mantiene le proporzioni. */
export async function toMapImage(image: GeneratedImage): Promise<File> {
  const bytes = Uint8Array.from(atob(image.data), (c) => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: image.mimeType }));
  const scale = Math.min(1, MAP_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.9),
  );
  if (!blob) throw new Error("Impossibile ridurre l'immagine.");
  return new File([blob], "mappa.webp", { type: "image/webp" });
}
