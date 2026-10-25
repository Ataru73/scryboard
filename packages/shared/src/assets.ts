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

/** Un'immagine caricata nella stanza, per il cassetto «Caricati». */
export interface RoomAsset {
  assetId: string;
  createdAt: string;
  /** Falso per le immagini del GM non ancora usate da un oggetto visibile: i giocatori non le vedono. */
  public: boolean;
}

export interface ListAssetsResponse {
  assets: RoomAsset[];
}

/** Quante immagini elenca al massimo il cassetto (le più recenti). */
export const MAX_LISTED_ASSETS = 200;

export interface UploadAssetResponse {
  assetId: string;
}

export function assetUrl(roomId: string, assetId: string): string {
  return `/api/rooms/${roomId}/assets/${assetId}`;
}
