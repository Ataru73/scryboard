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

export interface CutoutImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Rimuove lo sfondo uniforme contiguo ai bordi tramite flood fill BFS, sfumando i contorni. */
export function cutoutBackground(
  imageData: CutoutImageData,
  innerTolerance = 28,
  outerTolerance = 65,
): void {
  const { data, width, height } = imageData;
  if (width <= 0 || height <= 0) return;

  const cornerCoords: [number, number][] = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)],
    [width - 1, Math.floor(height / 2)],
  ];

  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  for (const [x, y] of cornerCoords) {
    const idx = (y * width + x) * 4;
    bgR += data[idx] ?? 0;
    bgG += data[idx + 1] ?? 0;
    bgB += data[idx + 2] ?? 0;
  }
  bgR /= cornerCoords.length;
  bgG /= cornerCoords.length;
  bgB /= cornerCoords.length;

  const dist = (idx: number) => {
    const dr = (data[idx] ?? 0) - bgR;
    const dg = (data[idx + 1] ?? 0) - bgG;
    const db = (data[idx + 2] ?? 0) - bgB;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let head = 0;
  let tail = 0;

  for (let x = 0; x < width; x++) {
    const top = x;
    const btm = (height - 1) * width + x;
    if (dist(top * 4) < outerTolerance) {
      visited[top] = 1;
      queue[tail++] = top;
    }
    if (!visited[btm] && dist(btm * 4) < outerTolerance) {
      visited[btm] = 1;
      queue[tail++] = btm;
    }
  }
  for (let y = 1; y < height - 1; y++) {
    const left = y * width;
    const right = y * width + (width - 1);
    if (!visited[left] && dist(left * 4) < outerTolerance) {
      visited[left] = 1;
      queue[tail++] = left;
    }
    if (!visited[right] && dist(right * 4) < outerTolerance) {
      visited[right] = 1;
      queue[tail++] = right;
    }
  }

  while (head < tail) {
    const curr = queue[head++] ?? 0;
    const cx = curr % width;
    const cy = Math.floor(curr / width);
    const d = dist(curr * 4);

    if (d <= innerTolerance) {
      data[curr * 4 + 3] = 0;
    } else {
      const factor = (d - innerTolerance) / (outerTolerance - innerTolerance);
      data[curr * 4 + 3] = Math.round(factor * 255);
    }

    if (cx > 0) {
      const n = curr - 1;
      if (!visited[n] && dist(n * 4) < outerTolerance) {
        visited[n] = 1;
        queue[tail++] = n;
      }
    }
    if (cx < width - 1) {
      const n = curr + 1;
      if (!visited[n] && dist(n * 4) < outerTolerance) {
        visited[n] = 1;
        queue[tail++] = n;
      }
    }
    if (cy > 0) {
      const n = curr - width;
      if (!visited[n] && dist(n * 4) < outerTolerance) {
        visited[n] = 1;
        queue[tail++] = n;
      }
    }
    if (cy < height - 1) {
      const n = curr + width;
      if (!visited[n] && dist(n * 4) < outerTolerance) {
        visited[n] = 1;
        queue[tail++] = n;
      }
    }
  }
}

const STAMP_SIDE = 512;

export interface StampImageOptions {
  transparent?: boolean;
}

/** Prepara l'immagine del timbro riducendola a 512×512 in WebP con eventuale rimozione dello sfondo. */
export async function toStampImage(
  image: GeneratedImage,
  options: StampImageOptions = { transparent: true },
): Promise<File> {
  const bytes = Uint8Array.from(atob(image.data), (c) => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: image.mimeType }));
  const canvas = document.createElement("canvas");
  canvas.width = STAMP_SIDE;
  canvas.height = STAMP_SIDE;
  const side = Math.min(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Impossibile creare il contesto grafico.");

  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    STAMP_SIDE,
    STAMP_SIDE,
  );
  bitmap.close();

  if (options.transparent !== false) {
    const imgData = ctx.getImageData(0, 0, STAMP_SIDE, STAMP_SIDE);
    cutoutBackground(imgData);
    ctx.putImageData(imgData, 0, 0);
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.9),
  );
  if (!blob) throw new Error("Impossibile ridurre l'immagine.");
  return new File([blob], "timbro.webp", { type: "image/webp" });
}
