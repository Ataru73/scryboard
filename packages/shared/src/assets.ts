export const MAX_ASSET_BYTES = 20 * 1024 * 1024;

export const ASSET_MIME_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;
export type AssetMimeType = keyof typeof ASSET_MIME_TYPES;

/** Id dell'asset: SHA-256 del contenuto + estensione (es. `ab12….png`). */
export const ASSET_ID_PATTERN = /^[0-9a-f]{64}\.(png|jpg|webp|gif)$/;

export interface UploadAssetResponse {
  assetId: string;
}

export function assetUrl(roomId: string, assetId: string): string {
  return `/api/rooms/${roomId}/assets/${assetId}`;
}
