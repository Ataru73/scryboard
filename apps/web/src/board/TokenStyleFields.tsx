import { DRAW_COLORS, MAX_ASSET_BYTES, PORTRAITS, TOKEN_SIZES } from "@scryboard/shared";
import { useId, useRef, useState } from "react";
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
    const patch: Partial<TokenDraft> = { portrait: picked.id, assetId: null };
    if (!name.trim() || name === previous?.label) {
      patch.name = picked.label;
      setName(picked.label);
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
      const { assetId } = await uploadImage(roomId, file, gmToken);
      onChange({ assetId });
    } catch (e) {
      setError(e instanceof UploadError ? e.message : "Caricamento non riuscito.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <label htmlFor={nameId} className="visually-hidden">
        Nome del token
      </label>
      <input
        id={nameId}
        className="token-name"
        value={name}
        placeholder="Nome del token"
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
      {DRAW_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className="color-button"
          style={{ background: c }}
          aria-pressed={value.color === c}
          aria-label={`Colore ${COLOR_NAMES[c] ?? c}`}
          title={COLOR_NAMES[c] ?? c}
          onClick={() => onChange({ color: c })}
        />
      ))}
      <span className="toolbar-separator" />
      <label htmlFor={sizeId} className="visually-hidden">
        Taglia
      </label>
      <select
        id={sizeId}
        value={value.size}
        onChange={(e) => onChange({ size: Number(e.target.value) })}
      >
        {TOKEN_SIZES.map((s) => (
          <option key={s.size} value={s.size}>
            {s.label}
          </option>
        ))}
      </select>
      <span className="toolbar-separator" />
      <button type="button" disabled={uploading} onClick={() => fileInput.current?.click()}>
        {uploading ? "Caricamento…" : value.assetId ? "Cambia immagine" : "Immagine"}
      </button>
      <button type="button" onClick={() => setLibraryOpen(true)}>
        Libreria
      </button>
      {(value.assetId || value.portrait) && (
        <button type="button" onClick={() => onChange({ assetId: null, portrait: null })}>
          Togli immagine
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
        aria-label="Immagine del token"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && <span className="error token-error">{error}</span>}
    </>
  );
}
