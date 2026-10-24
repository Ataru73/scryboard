import { DRAW_COLORS, TOKEN_SIZES } from "@scryboard/shared";
import { useId, useRef, useState } from "react";
import { COLOR_NAMES } from "./colors";
import type { TokenDraft } from "./tools";
import { UploadError, uploadImage } from "./upload";

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
  const fileInput = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const sizeId = useId();

  const commitName = () => {
    if (name !== value.name) onChange({ name: name.trim() });
  };

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { assetId } = await uploadImage(roomId, file);
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
      {value.assetId && (
        <button type="button" onClick={() => onChange({ assetId: null })}>
          Togli immagine
        </button>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        aria-label="Immagine del token"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && <span className="error token-error">{error}</span>}
    </>
  );
}
