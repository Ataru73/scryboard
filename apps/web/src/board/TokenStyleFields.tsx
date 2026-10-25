import { DRAW_COLORS, MAX_ASSET_BYTES, PORTRAITS, TOKEN_SIZES } from "@scryboard/shared";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { catalogLabel, colorLabel } from "../i18n/catalog";
import { storage } from "../lib/storage";
import { useAssetAuth } from "./assetAuth";
import { COLOR_NAMES } from "./colors";
import { PortraitPicker } from "./PortraitPicker";
import { TokenCropper } from "./TokenCropper";
import type { TokenDraft } from "./tools";
import { isSupportedImage, UploadError, uploadImage } from "./upload";

interface Props {
  value: TokenDraft;
  roomId: string;
  onChange: (patch: Partial<TokenDraft>) => void;
  /**
   * Per lo strumento Token il nome si applica a ogni tasto, perché il clic sulla lavagna arriva
   * prima del blur; per un token esistente si salva all'invio o all'uscita dal campo.
   */
  liveName?: boolean;
}

export function TokenStyleFields({ value, roomId, onChange, liveName = false }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(value.name);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  /** Immagine scelta dal disco, in attesa che l'utente ne scelga l'area. */
  const [cropping, setCropping] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const gmToken = useAssetAuth();
  const nameId = useId();
  const sizeId = useId();

  const commitName = () => {
    if (name !== value.name) onChange({ name: name.trim() });
  };

  /** Sceglie un'immagine: nome e taglia si adattano solo se non li ha già cambiati l'utente. */
  function pickPortrait(picked: (typeof PORTRAITS)[number]) {
    const previous = PORTRAITS.find((p) => p.id === value.portrait);
    const pickedLabel = catalogLabel(t, "portraits", picked.id, picked.label);
    const previousLabel = previous
      ? catalogLabel(t, "portraits", previous.id, previous.label)
      : undefined;
    const patch: Partial<TokenDraft> = { portrait: picked.id, assetId: null };
    if (!name.trim() || name === previousLabel) {
      patch.name = pickedLabel;
      setName(pickedLabel);
    }
    if (!previous || value.size === previous.size) patch.size = picked.size;
    storage.addRecentPortrait(picked.id);
    setLibraryOpen(false);
    onChange(patch);
  }

  /** Controlla il file e apre l'editor di ritaglio: si carica solo l'area scelta. */
  function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!isSupportedImage(file)) {
      setError(t("core.upload.unsupportedImage", { filename: file.name }));
    } else if (file.size > MAX_ASSET_BYTES) {
      setError(t("core.upload.imageTooLarge", { filename: file.name }));
    } else {
      setCropping(file);
    }
  }

  async function upload(file: File) {
    setCropping(null);
    setUploading(true);
    setError(null);
    try {
      const { assetId } = await uploadImage(roomId, file, gmToken);
      onChange({ assetId });
    } catch (e) {
      setError(e instanceof UploadError ? e.message : t("core.upload.failed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <label htmlFor={nameId} className="visually-hidden">
        {t("core.tokenStyle.name")}
      </label>
      <input
        id={nameId}
        className="token-name"
        value={name}
        placeholder={t("core.tokenStyle.name")}
        maxLength={40}
        onChange={(e) => {
          setName(e.target.value);
          if (liveName) onChange({ name: e.target.value });
        }}
        onBlur={liveName ? undefined : commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      <span className="toolbar-separator" />
      {DRAW_COLORS.map((c) => {
        const label = colorLabel(t, c, COLOR_NAMES[c] ?? c);
        return (
          <button
            key={c}
            type="button"
            className="color-button"
            style={{ background: c }}
            aria-pressed={value.color === c}
            aria-label={t("core.tokenStyle.color", { color: label })}
            title={label}
            onClick={() => onChange({ color: c })}
          />
        );
      })}
      <span className="toolbar-separator" />
      <label htmlFor={sizeId} className="visually-hidden">
        {t("core.tokenStyle.size")}
      </label>
      <select
        id={sizeId}
        value={value.size}
        onChange={(e) => onChange({ size: Number(e.target.value) })}
      >
        {TOKEN_SIZES.map((s) => (
          <option key={s.size} value={s.size}>
            {catalogLabel(t, "tokenSizes", String(s.size), s.label)}
          </option>
        ))}
      </select>
      <span className="toolbar-separator" />
      <button type="button" disabled={uploading} onClick={() => fileInput.current?.click()}>
        {uploading
          ? t("core.tokenStyle.uploading")
          : value.assetId
            ? t("core.tokenStyle.changeImage")
            : t("core.tokenStyle.image")}
      </button>
      <button type="button" onClick={() => setLibraryOpen(true)}>
        {t("core.tokenStyle.library")}
      </button>
      {(value.assetId || value.portrait) && (
        <button type="button" onClick={() => onChange({ assetId: null, portrait: null })}>
          {t("core.tokenStyle.removeImage")}
        </button>
      )}
      {cropping && (
        <TokenCropper
          file={cropping}
          onConfirm={(cropped) => void upload(cropped)}
          onCancel={() => setCropping(null)}
        />
      )}
      {libraryOpen && (
        <PortraitPicker
          color={value.color}
          roomId={roomId}
          tokenName={name}
          onPick={pickPortrait}
          onPickAsset={(assetId) => {
            setLibraryOpen(false);
            onChange({ assetId, portrait: null });
          }}
          onClose={() => setLibraryOpen(false)}
        />
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        aria-label={t("core.tokenStyle.imageInput")}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && <span className="error token-error">{error}</span>}
    </>
  );
}
