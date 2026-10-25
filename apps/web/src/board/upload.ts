import {
  IMAGE_MIME_TYPES,
  MAX_ASSET_BYTES,
  MAX_VIDEO_BYTES,
  VIDEO_MIME_TYPES,
} from "@scryboard/shared";
import { i18n } from "../i18n";
import { api, describeApiError } from "../lib/api";

export interface UploadedImage {
  assetId: string;
  width: number;
  height: number;
}

export class UploadError extends Error {}

export function isSupportedImage(file: File): boolean {
  return file.type in IMAGE_MIME_TYPES;
}

/** Mappe animate (WebM, MP4): solo il GM le usa, come mappa. */
export function isSupportedVideo(file: File): boolean {
  return file.type in VIDEO_MIME_TYPES;
}

/** Dimensioni del video, lette dai metadati. */
function videoSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = () => URL.revokeObjectURL(url);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const size = { width: video.videoWidth, height: video.videoHeight };
      done();
      if (size.width > 0 && size.height > 0) resolve(size);
      else reject(new Error("dimensioni non valide"));
    };
    video.onerror = () => {
      done();
      reject(new Error("video non leggibile"));
    };
    video.src = url;
  });
}

/** Carica un video (solo GM) leggendone le dimensioni dal browser. */
export async function uploadVideo(
  roomId: string,
  file: File,
  gmToken: string | null,
): Promise<UploadedImage> {
  if (!isSupportedVideo(file)) {
    throw new UploadError(i18n.t("core.upload.unsupportedVideo", { filename: file.name }));
  }
  if (file.size > MAX_VIDEO_BYTES) {
    throw new UploadError(i18n.t("core.upload.videoTooLarge", { filename: file.name }));
  }
  let size: { width: number; height: number };
  try {
    size = await videoSize(file);
  } catch {
    throw new UploadError(i18n.t("core.upload.unreadableVideo", { filename: file.name }));
  }
  try {
    const { assetId } = await api.uploadAsset(roomId, file, gmToken);
    return { assetId, ...size };
  } catch (error) {
    throw new UploadError(
      i18n.t("core.upload.fileFailed", {
        filename: file.name,
        reason: describeApiError(error),
      }),
    );
  }
}

/** Legge le dimensioni dell'immagine nel browser e la carica sul server. */
export async function uploadImage(
  roomId: string,
  file: File,
  gmToken: string | null,
): Promise<UploadedImage> {
  if (!isSupportedImage(file)) {
    throw new UploadError(i18n.t("core.upload.unsupportedImage", { filename: file.name }));
  }
  if (file.size > MAX_ASSET_BYTES) {
    throw new UploadError(i18n.t("core.upload.imageTooLarge", { filename: file.name }));
  }
  let width: number;
  let height: number;
  try {
    const bitmap = await createImageBitmap(file);
    ({ width, height } = bitmap);
    bitmap.close();
  } catch {
    throw new UploadError(i18n.t("core.upload.invalidImage", { filename: file.name }));
  }
  try {
    const { assetId } = await api.uploadAsset(roomId, file, gmToken);
    return { assetId, width, height };
  } catch (error) {
    throw new UploadError(
      i18n.t("core.upload.fileFailed", {
        filename: file.name,
        reason: describeApiError(error),
      }),
    );
  }
}
