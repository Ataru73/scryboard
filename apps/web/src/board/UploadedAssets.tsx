import { isVideoAsset, MAX_ASSET_BYTES, type RoomAsset } from "@scryboard/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const gmToken = useAssetAuth();
  const [assets, setAssets] = useState<RoomAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cropping, setCropping] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      // I video sono mappe animate: non si usano come immagine di un token.
      setAssets(
        (await api.listAssets(roomId, gmToken)).assets.filter((a) => !isVideoAsset(a.assetId)),
      );
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
      setError(t("assets.uploaded.unsupportedFormat", { name: file.name }));
    } else if (file.size > MAX_ASSET_BYTES) {
      setError(t("assets.uploaded.tooLarge", { name: file.name }));
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
      setError(e instanceof UploadError ? e.message : t("assets.uploaded.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="stack uploaded-assets">
      <div className="uploaded-actions">
        <button type="button" disabled={uploading} onClick={() => fileInput.current?.click()}>
          {uploading ? t("assets.uploaded.uploading") : t("assets.uploaded.add")}
        </button>
        <span className="muted small">{t("assets.uploaded.help")}</span>
      </div>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
      {assets?.length === 0 && <p className="muted small">{t("assets.uploaded.empty")}</p>}
      <div className="portrait-grid generated-grid">
        {assets?.map((asset) => (
          <button
            key={asset.assetId}
            type="button"
            className="generated-button"
            aria-label={asset.public ? t("assets.uploaded.use") : t("assets.uploaded.usePrivate")}
            title={asset.public ? undefined : t("assets.uploaded.privateTitle")}
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
        aria-label={t("assets.uploaded.fileInput")}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
