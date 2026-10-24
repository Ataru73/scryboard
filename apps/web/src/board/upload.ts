import { ASSET_MIME_TYPES, MAX_ASSET_BYTES } from "@scryboard/shared";
import { api, describeApiError } from "../lib/api";

export interface UploadedImage {
  assetId: string;
  width: number;
  height: number;
}

export class UploadError extends Error {}

export function isSupportedImage(file: File): boolean {
  return file.type in ASSET_MIME_TYPES;
}

/** Legge le dimensioni dell'immagine nel browser e la carica sul server. */
export async function uploadImage(
  roomId: string,
  file: File,
  gmToken: string | null,
): Promise<UploadedImage> {
  if (!isSupportedImage(file)) {
    throw new UploadError(`"${file.name}": formato non supportato (usa PNG, JPEG, WebP o GIF).`);
  }
  if (file.size > MAX_ASSET_BYTES) {
    throw new UploadError(`"${file.name}" è troppo grande (massimo 20 MB).`);
  }
  let width: number;
  let height: number;
  try {
    const bitmap = await createImageBitmap(file);
    ({ width, height } = bitmap);
    bitmap.close();
  } catch {
    throw new UploadError(`"${file.name}" non sembra un'immagine valida.`);
  }
  try {
    const { assetId } = await api.uploadAsset(roomId, file, gmToken);
    return { assetId, width, height };
  } catch (error) {
    throw new UploadError(`Caricamento di "${file.name}" fallito. ${describeApiError(error)}`);
  }
}
