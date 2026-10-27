import { assetUrl } from "@scryboard/shared";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildPrompt,
  DEFAULT_GEMINI_MODEL,
  GEMINI_STYLES,
  GeminiError,
  type GeminiStyleId,
  type GeneratedImage,
  generateVariants,
} from "../gemini/api";
import { toTokenImage } from "../gemini/resize";
import {
  ensureAssetInRoom,
  type GeneratedAsset,
  saveGeneratedAsset,
  useGeneratedAssets,
} from "../lib/generatedAssets";
import { storage } from "../lib/storage";
import { useAssetAuth } from "./assetAuth";
import { GeneratedThumb } from "./GeneratedThumb";
import { UploadError, uploadImage } from "./upload";
import { useImage } from "./useImage";

interface Props {
  roomId: string;
  apiKey: string;
  /** Nome del token, usato come descrizione iniziale. */
  tokenName: string;
  onPickAsset: (assetId: string) => void;
}

/** Miniatura di un'immagine già caricata nella stanza (stessa autorizzazione dei token). */
export function AssetThumb({ roomId, assetId }: { roomId: string; assetId: string }) {
  const image = useImage(assetUrl(roomId, assetId));
  if (!image) return <span className="generated-missing" />;
  return <img src={image.src} alt="" />;
}

/** Scheda "Genera" della libreria: descrizione, stile e varianti da scegliere con un clic. */
export function GeneratePanel({ roomId, apiKey, tokenName, onPickAsset }: Props) {
  const { t } = useTranslation();
  const descId = useId();
  const gmToken = useAssetAuth();
  const [description, setDescription] = useState(tokenName);
  const [style, setStyle] = useState<GeminiStyleId>("bust");
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const savedTokens = useGeneratedAssets("token");

  async function generate() {
    setBusy(true);
    setError(null);
    setResults([]);
    try {
      const model = storage.getGeminiModel() || DEFAULT_GEMINI_MODEL;
      const prompt = buildPrompt(description, style);
      setResults(await generateVariants({ apiKey, model, prompt }, count));
    } catch (e) {
      setError(e instanceof GeminiError ? e.message : t("assets.generate.generationFailed"));
    } finally {
      setBusy(false);
    }
  }

  /** Solo la variante scelta si riduce, si carica e si memorizza per tutte le stanze. */
  async function choose(image: GeneratedImage) {
    setBusy(true);
    setError(null);
    try {
      const file = await toTokenImage(image);
      const { assetId } = await uploadImage(roomId, file, gmToken);
      await saveGeneratedAsset({
        id: assetId,
        kind: "token",
        blob: file,
        mimeType: file.type,
        prompt: description,
        createdAt: new Date().toISOString(),
        metadata: { style },
      });
      storage.addGenerated(roomId, assetId);
      onPickAsset(assetId);
    } catch (e) {
      setError(e instanceof UploadError ? e.message : t("assets.generate.uploadFailed"));
      setBusy(false);
    }
  }

  /** Riutilizza un token generato in precedenza in qualunque stanza. */
  async function reuse(asset: GeneratedAsset) {
    setBusy(true);
    setError(null);
    try {
      const assetId = await ensureAssetInRoom(roomId, asset, gmToken);
      storage.addGenerated(roomId, assetId);
      onPickAsset(assetId);
    } catch (e) {
      setError(e instanceof UploadError ? e.message : t("assets.generate.uploadFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack generate-panel">
      <label className="field" htmlFor={descId}>
        <span>{t("assets.generate.description")}</span>
        <input
          id={descId}
          value={description}
          maxLength={200}
          placeholder={t("assets.generate.descriptionPlaceholder")}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="generate-options">
        <label className="field">
          <span>{t("assets.generate.style")}</span>
          <select value={style} onChange={(e) => setStyle(e.target.value as GeminiStyleId)}>
            {GEMINI_STYLES.map((s) => (
              <option key={s.id} value={s.id}>
                {t(`assets.generate.styles.${s.id}`, { defaultValue: s.label })}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("assets.generate.variants")}</span>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="primary"
          disabled={busy || !description.trim()}
          onClick={() => void generate()}
        >
          {busy && results.length === 0
            ? t("assets.generate.generating")
            : t("assets.generate.generate")}
        </button>
      </div>
      <p className="muted small">{t("assets.generate.billing")}</p>
      {error && <p className="error">{error}</p>}
      {results.length > 0 && (
        <div className="portrait-grid generated-grid">
          {results.map((image, i) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: le varianti non hanno un id.
              key={i}
              type="button"
              className="generated-button"
              disabled={busy}
              aria-label={t("assets.generate.useVariant", { number: i + 1 })}
              onClick={() => void choose(image)}
            >
              <img src={`data:${image.mimeType};base64,${image.data}`} alt="" />
            </button>
          ))}
        </div>
      )}
      {savedTokens.length > 0 && (
        <section aria-label={t("assets.generate.history")}>
          <h3 className="muted small">{t("assets.generate.history")}</h3>
          <div className="portrait-grid generated-grid">
            {savedTokens.map((asset) => (
              <button
                key={asset.id}
                type="button"
                className="generated-button"
                aria-label={t("assets.generate.reuse")}
                title={asset.prompt}
                disabled={busy}
                onClick={() => void reuse(asset)}
              >
                <GeneratedThumb blob={asset.blob} />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
