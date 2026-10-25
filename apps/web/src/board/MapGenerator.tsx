import { useId, useState } from "react";
import {
  buildMapPrompt,
  DEFAULT_GEMINI_MODEL,
  GeminiError,
  type GeneratedImage,
  generateVariants,
  MAP_FORMATS,
  MAP_STYLES,
  type MapFormatId,
  type MapStyleId,
} from "../gemini/api";
import { toMapImage } from "../gemini/resize";
import { storage } from "../lib/storage";

interface Props {
  apiKey: string;
  /** Riceve la mappa scelta, già ridotta: la lavagna la carica come qualsiasi immagine. */
  onPick: (file: File) => void;
  onClose: () => void;
}

/** Finestra del GM per generare una mappa da una descrizione e sceglierne una variante. */
export function MapGenerator({ apiKey, onPick, onClose }: Props) {
  const titleId = useId();
  const descId = useId();
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState<MapStyleId>("dungeon");
  const [format, setFormat] = useState<MapFormatId>("16:9");
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GeneratedImage[]>([]);

  async function generate() {
    setBusy(true);
    setError(null);
    setResults([]);
    try {
      const model = storage.getGeminiModel() || DEFAULT_GEMINI_MODEL;
      const prompt = buildMapPrompt(description, style);
      setResults(await generateVariants({ apiKey, model, prompt, aspectRatio: format }, count));
    } catch (e) {
      setError(e instanceof GeminiError ? e.message : "Generazione non riuscita.");
    } finally {
      setBusy(false);
    }
  }

  async function choose(image: GeneratedImage) {
    setBusy(true);
    setError(null);
    try {
      onPick(await toMapImage(image));
      onClose();
    } catch {
      setError("Impossibile usare questa mappa.");
      setBusy(false);
    }
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
      <h2 id={titleId}>Genera una mappa</h2>
      <label className="field" htmlFor={descId}>
        <span>Descrizione</span>
        <textarea
          id={descId}
          rows={3}
          value={description}
          maxLength={400}
          placeholder="Es. cripta con un altare al centro, colonne crollate e pozze d'acqua"
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="generate-options">
        <label className="field">
          <span>Tipo</span>
          <select value={style} onChange={(e) => setStyle(e.target.value as MapStyleId)}>
            {MAP_STYLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Formato</span>
          <select value={format} onChange={(e) => setFormat(e.target.value as MapFormatId)}>
            {MAP_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Varianti</span>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">
        Ogni variante è una richiesta a Gemini, addebitata sul conto Google della tua chiave. La
        mappa scelta viene messa al centro della vista.
      </p>
      {error && <p className="error">{error}</p>}
      {results.length > 0 && (
        <div className="map-results">
          {results.map((image, i) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: le varianti non hanno un id.
              key={i}
              type="button"
              className="generated-button"
              disabled={busy}
              aria-label={`Usa la mappa ${i + 1}`}
              onClick={() => void choose(image)}
            >
              <img src={`data:${image.mimeType};base64,${image.data}`} alt="" />
            </button>
          ))}
        </div>
      )}
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          Chiudi
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy || !description.trim()}
          onClick={() => void generate()}
        >
          {busy && results.length === 0 ? "Generazione…" : "Genera"}
        </button>
      </div>
    </dialog>
  );
}
