import { type ReactNode, useEffect, useId, useState } from "react";
import {
  DEFAULT_GEMINI_MODEL,
  GeminiError,
  type GeminiModel,
  listImageModels,
} from "../gemini/api";
import { storage } from "../lib/storage";

type Check = { state: "idle" | "testing" } | { state: "ok" } | { state: "error"; message: string };

/** Pulsante "Impostazioni" con la chiave API di Gemini per generare le immagini dei token. */
/** Con `icon` il pulsante mostra solo l'icona; il nome resta per screen reader e tooltip. */
export function SettingsButton({ className, icon }: { className?: string; icon?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const keyId = useId();
  const modelId = useId();
  const [apiKey, setApiKey] = useState(() => storage.getGeminiKey() ?? "");
  const [model, setModel] = useState(() => storage.getGeminiModel() ?? "");
  const [check, setCheck] = useState<Check>({ state: "idle" });
  /** Modelli per immagini disponibili con la chiave; null finché non sono stati scaricati. */
  const [models, setModels] = useState<GeminiModel[] | null>(null);

  const save = () => {
    storage.setGeminiKey(apiKey);
    storage.setGeminiModel(model);
  };

  /** Scarica i modelli con la chiave: se risponde, la chiave è valida. */
  async function loadModels(key: string): Promise<boolean> {
    setCheck({ state: "testing" });
    try {
      setModels(await listImageModels(key));
      setCheck({ state: "ok" });
      return true;
    } catch (e) {
      setModels(null);
      setCheck({
        state: "error",
        message: e instanceof GeminiError ? e.message : "Prova non riuscita.",
      });
      return false;
    }
  }

  async function test() {
    if (await loadModels(apiKey.trim())) save();
  }

  // Con una chiave già salvata l'elenco si scarica all'apertura (non costa nulla).
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo all'apertura.
  useEffect(() => {
    const saved = storage.getGeminiKey();
    if (open && saved) void loadModels(saved);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={icon ? "Impostazioni" : undefined}
        title={icon ? "Impostazioni" : undefined}
        onClick={() => setOpen(true)}
      >
        {icon ?? "Impostazioni"}
      </button>
      {open && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: Esc chiude nativamente <dialog>.
        <dialog
          ref={(el) => {
            if (el && !el.open) el.showModal();
          }}
          className="card stack modal"
          aria-labelledby={titleId}
          onClose={() => setOpen(false)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <h2 id={titleId}>Impostazioni</h2>
          <p className="small">
            Con una chiave API di Gemini puoi generare le immagini dei token dalla scheda{" "}
            <strong>Genera</strong> della libreria e, da GM, le mappe dal pulsante{" "}
            <strong>Genera mappa</strong>. Senza chiave le funzioni non compaiono.
          </p>
          <label className="field" htmlFor={keyId}>
            <span>Chiave API di Gemini</span>
            <input
              id={keyId}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setModels(null);
                setCheck({ state: "idle" });
              }}
            />
          </label>
          <label className="field" htmlFor={modelId}>
            <span>Modello</span>
            {models && models.length > 0 ? (
              <select id={modelId} value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="">Predefinito ({DEFAULT_GEMINI_MODEL})</option>
                {/* Un modello scelto in precedenza resta selezionabile anche se non è più in elenco. */}
                {model && !models.some((m) => m.id === model) && (
                  <option value={model}>{model}</option>
                )}
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName === m.id ? m.id : `${m.displayName} (${m.id})`}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={modelId}
                value={model}
                placeholder={DEFAULT_GEMINI_MODEL}
                spellCheck={false}
                onChange={(e) => setModel(e.target.value)}
              />
            )}
          </label>
          {models && models.length === 0 && (
            <p className="muted small">
              Con questa chiave non risultano modelli per immagini: puoi scrivere il nome a mano.
            </p>
          )}
          <p className="muted small">
            La chiave resta salvata solo in questo browser e le richieste partono da qui verso
            Google: Scryboard non le vede. Le richieste sono addebitate sul conto Google di chi ha
            creato la chiave, e qualunque script della pagina può leggerla: usa una chiave dedicata,
            con limiti di spesa.
          </p>
          {check.state === "ok" && (
            <p role="status">
              Chiave valida{models ? `: ${models.length} modelli per immagini` : ""}.
            </p>
          )}
          {check.state === "error" && <p className="error">{check.message}</p>}
          <div className="modal-actions">
            <button
              type="button"
              disabled={!apiKey.trim() || check.state === "testing"}
              onClick={() => void test()}
            >
              {check.state === "testing" ? "Prova…" : "Prova chiave"}
            </button>
            <button
              type="button"
              className="danger"
              disabled={!apiKey && !storage.getGeminiKey()}
              onClick={() => {
                storage.setGeminiKey(null);
                setApiKey("");
                setModels(null);
                setCheck({ state: "idle" });
              }}
            >
              Dimentica chiave
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                save();
                setOpen(false);
              }}
            >
              Salva
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
