import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildStampPrompt,
  DEFAULT_GEMINI_MODEL,
  GeminiError,
  type GeneratedImage,
  generateVariants,
  STAMP_STYLES,
  type StampStyleId,
} from "../gemini/api";
import { toStampImage } from "../gemini/resize";
import { type GeneratedAsset, useGeneratedAssets } from "../lib/generatedAssets";
import { storage } from "../lib/storage";
import { GeneratedThumb } from "./GeneratedThumb";

interface Props {
  apiKey: string;
  /** Riceve il timbro scelto, ridotto e pronto per essere caricato. */
  onPick: (file: File, size: number, prompt: string) => void;
  onClose: () => void;
}

const STAMP_SIZES = [
  { value: 0.8, label: "0.8" },
  { value: 1, label: "1" },
  { value: 1.5, label: "1.5" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
];

/** Finestra del GM per generare un timbro/elemento di scenario con Gemini e sceglierne una variante. */
export function StampGenerator({ apiKey, onPick, onClose }: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const descId = useId();
  const transparentId = useId();
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState<StampStyleId>("prop");
  const [size, setSize] = useState(1);
  const [transparent, setTransparent] = useState(true);
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const savedStamps = useGeneratedAssets("stamp");

  async function generate() {
    setBusy(true);
    setError(null);
    setResults([]);
    try {
      const model = storage.getGeminiModel() || DEFAULT_GEMINI_MODEL;
      const prompt = buildStampPrompt(description, style);
      setResults(await generateVariants({ apiKey, model, prompt }, count));
    } catch (e) {
      setError(e instanceof GeminiError ? e.message : t("assets.stampGenerator.generationFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function choose(image: GeneratedImage) {
    setBusy(true);
    setError(null);
    try {
      const file = await toStampImage(image, { transparent });
      onPick(file, size, description);
      onClose();
    } catch {
      setError(t("assets.stampGenerator.useFailed"));
      setBusy(false);
    }
  }

  function reuse(asset: GeneratedAsset) {
    const sz = asset.metadata?.size ?? 1;
    const file = new File([asset.blob], asset.id, { type: asset.mimeType });
    onPick(file, sz, asset.prompt);
    onClose();
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc chiude nativamente <dialog>.
    <dialog
      ref={(el) => {
        if (el && !el.open) el.showModal();
      }}
      className="card stack modal modal-wide"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <h2 id={titleId}>{t("assets.stampGenerator.title")}</h2>
      <label className="field" htmlFor={descId}>
        <span>{t("assets.stampGenerator.description")}</span>
        <textarea
          id={descId}
          rows={3}
          value={description}
          maxLength={400}
          placeholder={t("assets.stampGenerator.descriptionPlaceholder")}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="generate-options">
        <label className="field">
          <span>{t("assets.stampGenerator.kind")}</span>
          <select value={style} onChange={(e) => setStyle(e.target.value as StampStyleId)}>
            {STAMP_STYLES.map((s) => (
              <option key={s.id} value={s.id}>
                {t(`assets.stampGenerator.styles.${s.id}`, { defaultValue: s.label })}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("assets.stampGenerator.size")}</span>
          <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {STAMP_SIZES.map((sz) => (
              <option key={sz.value} value={sz.value}>
                {t("assets.stampGenerator.cells", { count: sz.label })}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("assets.stampGenerator.variants")}</span>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="checkbox small" htmlFor={transparentId}>
        <input
          id={transparentId}
          type="checkbox"
          checked={transparent}
          onChange={(e) => setTransparent(e.target.checked)}
        />
        {t("assets.stampGenerator.transparent")}
      </label>
      <p className="muted small">{t("assets.stampGenerator.billing")}</p>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
      {results.length > 0 && (
        <div className="grid generated-grid">
          {results.map((img, i) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: le immagini provengono da un array senza id.
              key={i}
              type="button"
              className="generated-button"
              disabled={busy}
              aria-label={t("assets.stampGenerator.useStamp", { number: i + 1 })}
              onClick={() => void choose(img)}
            >
              <img src={`data:${img.mimeType};base64,${img.data}`} alt="" />
            </button>
          ))}
        </div>
      )}
      {savedStamps.length > 0 && (
        <section aria-label={t("assets.stampGenerator.history")}>
          <h3 className="muted small">{t("assets.stampGenerator.history")}</h3>
          <div className="grid generated-grid">
            {savedStamps.map((asset) => (
              <button
                key={asset.id}
                type="button"
                className="generated-button"
                disabled={busy}
                aria-label={t("assets.stampGenerator.reuse")}
                title={asset.prompt}
                onClick={() => reuse(asset)}
              >
                <GeneratedThumb blob={asset.blob} />
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          {t("assets.stampGenerator.close")}
        </button>
        <button
          type="button"
          className="accent"
          disabled={busy || !description.trim()}
          onClick={() => void generate()}
        >
          {busy ? t("assets.stampGenerator.generating") : t("assets.stampGenerator.generate")}
        </button>
      </div>
    </dialog>
  );
}
