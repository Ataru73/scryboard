import { assetUrl } from "@scryboard/shared";
import { useId, useState } from "react";
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
import { storage } from "../lib/storage";
import { useAssetAuth } from "./assetAuth";
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
  const descId = useId();
  const gmToken = useAssetAuth();
  const [description, setDescription] = useState(tokenName);
  const [style, setStyle] = useState<GeminiStyleId>("bust");
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [history, setHistory] = useState(() => storage.getGenerated(roomId));

  async function generate() {
    setBusy(true);
    setError(null);
    setResults([]);
    try {
      const model = storage.getGeminiModel() || DEFAULT_GEMINI_MODEL;
      const prompt = buildPrompt(description, style);
      setResults(await generateVariants({ apiKey, model, prompt }, count));
    } catch (e) {
      setError(e instanceof GeminiError ? e.message : "Generazione non riuscita.");
    } finally {
      setBusy(false);
    }
  }

  /** Solo la variante scelta si riduce e si carica; le altre vengono scartate. */
  async function choose(image: GeneratedImage) {
    setBusy(true);
    setError(null);
    try {
      const { assetId } = await uploadImage(roomId, await toTokenImage(image), gmToken);
      storage.addGenerated(roomId, assetId);
      setHistory(storage.getGenerated(roomId));
      onPickAsset(assetId);
    } catch (e) {
      setError(e instanceof UploadError ? e.message : "Caricamento non riuscito.");
      setBusy(false);
    }
  }

  return (
    <div className="stack generate-panel">
      <label className="field" htmlFor={descId}>
        <span>Descrizione</span>
        <input
          id={descId}
          value={description}
          maxLength={200}
          placeholder="Es. goblin con l'arco e il cappuccio verde"
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="generate-options">
        <label className="field">
          <span>Stile</span>
          <select value={style} onChange={(e) => setStyle(e.target.value as GeminiStyleId)}>
            {GEMINI_STYLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Varianti</span>
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
          {busy && results.length === 0 ? "Generazione…" : "Genera"}
        </button>
      </div>
      <p className="muted small">
        Ogni variante è una richiesta a Gemini, addebitata sul conto Google della tua chiave.
      </p>
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
              aria-label={`Usa la variante ${i + 1}`}
              onClick={() => void choose(image)}
            >
              <img src={`data:${image.mimeType};base64,${image.data}`} alt="" />
            </button>
          ))}
        </div>
      )}
      {history.length > 0 && (
        <section aria-label="Generate in precedenza">
          <h3 className="muted small">Generate in precedenza</h3>
          <div className="portrait-grid generated-grid">
            {history.map((assetId) => (
              <button
                key={assetId}
                type="button"
                className="generated-button"
                aria-label="Riusa un'immagine generata"
                onClick={() => onPickAsset(assetId)}
              >
                <AssetThumb roomId={roomId} assetId={assetId} />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
