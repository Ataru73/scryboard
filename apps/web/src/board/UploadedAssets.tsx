import { MAX_ASSET_BYTES, type RoomAsset } from "@scryboard/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, describeApiError } from "../lib/api";
import { useAssetAuth } from "./assetAuth";
import { AssetThumb } from "./GeneratePanel";
import { TokenCropper } from "./TokenCropper";
import { isSupportedImage, UploadError, uploadImage } from "./upload";

interface Props {
  roomId: string;
  onPickAsset: (assetId: string) => void;
}

/**
 * Scheda «Caricati»: le immagini già nella stanza, da riusare per un token. Si può anche caricarne
 * di nuove senza piazzarle: il GM prepara in anticipo i token dei mostri, ritagliati a cerchio.
 */
export function UploadedAssets({ roomId, onPickAsset }: Props) {
  const gmToken = useAssetAuth();
  const [assets, setAssets] = useState<RoomAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cropping, setCropping] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setAssets((await api.listAssets(roomId, gmToken)).assets);
    } catch (e) {
      setError(describeApiError(e));
    }
  }, [roomId, gmToken]);

  useEffect(() => {
    void load();
  }, [load]);

  function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!isSupportedImage(file)) {
      setError(`"${file.name}": formato non supportato (usa PNG, JPEG, WebP o GIF).`);
    } else if (file.size > MAX_ASSET_BYTES) {
      setError(`"${file.name}" è troppo grande (massimo 20 MB).`);
    } else {
      setCropping(file);
    }
  }

  async function upload(file: File) {
    setCropping(null);
    setUploading(true);
    setError(null);
    try {
      await uploadImage(roomId, file, gmToken);
      await load();
    } catch (e) {
      setError(e instanceof UploadError ? e.message : "Caricamento non riuscito.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="stack uploaded-assets">
      <div className="uploaded-actions">
        <button type="button" disabled={uploading} onClick={() => fileInput.current?.click()}>
          {uploading ? "Caricamento…" : "Aggiungi alla raccolta"}
        </button>
        <span className="muted small">
          Carica un'immagine senza piazzarla: la ritrovi qui quando serve.
        </span>
      </div>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
      {assets?.length === 0 && (
        <p className="muted small">Nessuna immagine caricata in questa stanza.</p>
      )}
      <div className="portrait-grid generated-grid">
        {assets?.map((asset) => (
          <button
            key={asset.assetId}
            type="button"
            className="generated-button"
            aria-label={asset.public ? "Usa questa immagine" : "Usa questa immagine (solo GM)"}
            title={
              asset.public
                ? undefined
                : "Solo il GM la vede finché non la usi su un oggetto visibile"
            }
            onClick={() => onPickAsset(asset.assetId)}
          >
            <AssetThumb roomId={roomId} assetId={asset.assetId} />
            {!asset.public && <span className="asset-private">GM</span>}
          </button>
        ))}
      </div>
      {cropping && (
        <TokenCropper
          file={cropping}
          onConfirm={(cropped) => void upload(cropped)}
          onCancel={() => setCropping(null)}
        />
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        aria-label="Immagine da aggiungere alla raccolta"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
