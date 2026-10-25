import { Readable } from "node:stream";
import { Storage } from "@google-cloud/storage";
import { ASSET_ID_PATTERN } from "@scryboard/shared";
import { type AssetStore, assetIdFor, contentTypeOf, type StoredAsset } from "./store";

/**
 * Immagini su un bucket Google Cloud Storage, una cartella per stanza. Le credenziali sono
 * quelle predefinite dell'ambiente (su Cloud Run, il service account del servizio).
 */
export class GcsAssetStore implements AssetStore {
  private readonly bucket;

  constructor(bucketName: string, storage = new Storage()) {
    this.bucket = storage.bucket(bucketName);
  }

  async put(roomId: string, data: Uint8Array): Promise<string> {
    const assetId = assetIdFor(data);
    const file = this.bucket.file(`${roomId}/${assetId}`);
    const [exists] = await file.exists();
    if (!exists) await file.save(data, { contentType: contentTypeOf(assetId), resumable: false });
    return assetId;
  }

  async get(roomId: string, assetId: string): Promise<StoredAsset | null> {
    if (!ASSET_ID_PATTERN.test(assetId)) return null;
    const file = this.bucket.file(`${roomId}/${assetId}`);
    const [metadata] = await file.getMetadata().catch(() => [null]);
    if (!metadata) return null;
    return {
      body: Readable.toWeb(file.createReadStream()) as ReadableStream<Uint8Array>,
      size: Number(metadata.size),
      contentType: contentTypeOf(assetId),
    };
  }

  async deleteRoom(roomId: string): Promise<void> {
    await this.bucket.deleteFiles({ prefix: `${roomId}/`, force: true });
  }
}
