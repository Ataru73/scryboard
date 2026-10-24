/** Ritaglio quadrato di un'immagine: `zoom` ≥ 1 (1 = il lato corto intero), centro in pixel. */
export interface Crop {
  zoom: number;
  cx: number;
  cy: number;
}

export const MAX_ZOOM = 5;

/** Lato in pixel dell'immagine sorgente coperto dal ritaglio. */
export function cropSide(width: number, height: number, zoom: number): number {
  return Math.min(width, height) / zoom;
}

/** Tiene lo zoom nei limiti e il ritaglio dentro l'immagine: non si vedono mai bordi vuoti. */
export function clampCrop(width: number, height: number, crop: Crop): Crop {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, crop.zoom));
  const half = cropSide(width, height, zoom) / 2;
  return {
    zoom,
    cx: Math.min(width - half, Math.max(half, crop.cx)),
    cy: Math.min(height - half, Math.max(half, crop.cy)),
  };
}

/** Ritaglio iniziale: l'intero quadrato centrale, come i token mostravano le immagini prima. */
export function initialCrop(width: number, height: number): Crop {
  return { zoom: 1, cx: width / 2, cy: height / 2 };
}

/** Sposta il ritaglio di `dx`, `dy` pixel dell'anteprima (trascinare l'immagine verso destra la fa scorrere a destra). */
export function panCrop(
  width: number,
  height: number,
  crop: Crop,
  dx: number,
  dy: number,
  preview: number,
): Crop {
  const k = cropSide(width, height, crop.zoom) / preview;
  return clampCrop(width, height, { ...crop, cx: crop.cx - dx * k, cy: crop.cy - dy * k });
}

/** Cambia lo zoom tenendo fermo il punto sotto `anchor` (0–1 dell'anteprima, 0,5 = centro). */
export function zoomCrop(
  width: number,
  height: number,
  crop: Crop,
  zoom: number,
  anchor = { x: 0.5, y: 0.5 },
): Crop {
  const next = Math.min(MAX_ZOOM, Math.max(1, zoom));
  const before = cropSide(width, height, crop.zoom);
  const after = cropSide(width, height, next);
  return clampCrop(width, height, {
    zoom: next,
    cx: crop.cx + (anchor.x - 0.5) * (before - after),
    cy: crop.cy + (anchor.y - 0.5) * (before - after),
  });
}

/** Regione sorgente (x, y, lato) del ritaglio. */
export function cropRegion(width: number, height: number, crop: Crop) {
  const side = cropSide(width, height, crop.zoom);
  return { x: crop.cx - side / 2, y: crop.cy - side / 2, side };
}

const OUTPUT_SIDE = 512;

/** Disegna il ritaglio a 512×512 in WebP, pronto da caricare come asset. */
export async function renderCrop(bitmap: ImageBitmap, crop: Crop): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIDE;
  canvas.height = OUTPUT_SIDE;
  const { x, y, side } = cropRegion(bitmap.width, bitmap.height, crop);
  canvas.getContext("2d")?.drawImage(bitmap, x, y, side, side, 0, 0, OUTPUT_SIDE, OUTPUT_SIDE);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.9),
  );
  if (!blob) throw new Error("Impossibile ritagliare l'immagine.");
  return new File([blob], "token.webp", { type: "image/webp" });
}
