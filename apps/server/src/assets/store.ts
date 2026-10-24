import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { ASSET_ID_PATTERN, ASSET_MIME_TYPES, type AssetMimeType } from "@scryboard/shared";

export interface StoredAsset {
  body: ReadableStream<Uint8Array>;
  size: number;
  contentType: AssetMimeType;
}

/** Archivio delle immagini caricate. Oggi su disco; in futuro anche su storage S3-compatibile. */
export interface AssetStore {
  put(roomId: string, data: Uint8Array): Promise<string>;
  get(roomId: string, assetId: string): Promise<StoredAsset | null>;
}

/** Riconosce il formato dai primi byte: il Content-Type dichiarato dal client non è affidabile. */
export function detectImageType(data: Uint8Array): AssetMimeType | null {
  const startsWith = (bytes: number[], offset = 0) => bytes.every((b, i) => data[offset + i] === b);
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8))
    return "image/webp";
  return null;
}

const CONTENT_TYPE_BY_EXTENSION = Object.fromEntries(
  Object.entries(ASSET_MIME_TYPES).map(([mime, ext]) => [ext, mime as AssetMimeType]),
);

export class UnsupportedAssetError extends Error {}

export class LocalAssetStore implements AssetStore {
  constructor(private readonly root: string) {}

  async put(roomId: string, data: Uint8Array): Promise<string> {
    const type = detectImageType(data);
    if (!type) throw new UnsupportedAssetError("Formato immagine non supportato");
    const assetId = `${createHash("sha256").update(data).digest("hex")}.${ASSET_MIME_TYPES[type]}`;
    const dir = join(this.root, roomId);
    const path = join(dir, assetId);
    if (await exists(path)) return assetId; // Stesso contenuto già caricato.
    await mkdir(dir, { recursive: true });
    // Scrittura atomica: chi legge non vede mai un file a metà.
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, path);
    return assetId;
  }

  async get(roomId: string, assetId: string): Promise<StoredAsset | null> {
    if (!ASSET_ID_PATTERN.test(assetId)) return null;
    const path = join(this.root, roomId, assetId);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) return null;
    const extension = assetId.split(".").pop() as string;
    return {
      body: Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>,
      size: info.size,
      contentType: CONTENT_TYPE_BY_EXTENSION[extension] as AssetMimeType,
    };
  }
}

async function exists(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null)) !== null;
}
