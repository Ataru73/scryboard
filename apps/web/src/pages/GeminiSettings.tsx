import { useId, useState } from "react";
import { DEFAULT_GEMINI_MODEL, GeminiError, testKey } from "../gemini/api";
import { storage } from "../lib/storage";

type Check = { state: "idle" | "testing" } | { state: "ok" } | { state: "error"; message: string };

/** Pulsante "Impostazioni" con la chiave API di Gemini per generare le immagini dei token. */
export function SettingsButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const keyId = useId();
  const modelId = useId();
  const [apiKey, setApiKey] = useState(() => storage.getGeminiKey() ?? "");
  const [model, setModel] = useState(() => storage.getGeminiModel() ?? "");
  const [check, setCheck] = useState<Check>({ state: "idle" });

  const save = () => {
    storage.setGeminiKey(apiKey);
    storage.setGeminiModel(model);
  };

  async function test() {
    setCheck({ state: "testing" });
    try {
      await testKey(apiKey.trim(), model.trim() || DEFAULT_GEMINI_MODEL);
      save();
      setCheck({ state: "ok" });
    } catch (e) {
      setCheck({
        state: "error",
        message: e instanceof GeminiError ? e.message : "Prova non riuscita.",
      });
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        Impostazioni
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
            <strong>Genera</strong> della libreria. Senza chiave la funzione non compare.
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
                setCheck({ state: "idle" });
              }}
            />
          </label>
          <label className="field" htmlFor={modelId}>
            <span>Modello</span>
            <input
              id={modelId}
              value={model}
              placeholder={DEFAULT_GEMINI_MODEL}
              spellCheck={false}
              onChange={(e) => setModel(e.target.value)}
            />
          </label>
          <p className="muted small">
            La chiave resta salvata solo in questo browser e le richieste partono da qui verso
            Google: Scryboard non le vede. Le richieste sono addebitate sul conto Google di chi ha
            creato la chiave, e qualunque script della pagina può leggerla: usa una chiave dedicata,
            con limiti di spesa.
          </p>
          {check.state === "ok" && <p role="status">Chiave valida.</p>}
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
