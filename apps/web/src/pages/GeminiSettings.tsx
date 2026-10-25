import { type ReactNode, useEffect, useId, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  DEFAULT_GEMINI_MODEL,
  GeminiError,
  type GeminiModel,
  listGeminiModels,
} from "../gemini/api";
import { DEFAULT_VISION_MODEL, pickDefaultVisionModel } from "../gemini/walls";
import { storage } from "../lib/storage";

type Check = { state: "idle" | "testing" } | { state: "ok" } | { state: "error"; error: unknown };

/** Pulsante "Impostazioni" con la chiave API di Gemini per generare le immagini dei token. */
/** Con `icon` il pulsante mostra solo l'icona; il nome resta per screen reader e tooltip. */
export function SettingsButton({ className, icon }: { className?: string; icon?: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const keyId = useId();
  const modelId = useId();
  const [apiKey, setApiKey] = useState(() => storage.getGeminiKey() ?? "");
  const [model, setModel] = useState(() => storage.getGeminiModel() ?? "");
  const [visionModel, setVisionModel] = useState(() => storage.getGeminiVisionModel() ?? "");
  const visionId = useId();
  const [check, setCheck] = useState<Check>({ state: "idle" });
  /** Modelli per immagini disponibili con la chiave; null finché non sono stati scaricati. */
  const [models, setModels] = useState<GeminiModel[] | null>(null);
  /** Modelli che leggono le immagini, per tracciare i muri; null come sopra. */
  const [visionModels, setVisionModels] = useState<GeminiModel[] | null>(null);

  const save = () => {
    storage.setGeminiKey(apiKey);
    storage.setGeminiModel(model);
    storage.setGeminiVisionModel(visionModel);
  };

  /** Scarica i modelli con la chiave: se risponde, la chiave è valida. */
  async function loadModels(key: string): Promise<boolean> {
    setCheck({ state: "testing" });
    try {
      const found = await listGeminiModels(key);
      setModels(found.image);
      setVisionModels(found.vision);
      setCheck({ state: "ok" });
      return true;
    } catch (e) {
      setModels(null);
      setVisionModels(null);
      setCheck({ state: "error", error: e });
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
        aria-label={icon ? t("pages.geminiSettings.title") : undefined}
        title={icon ? t("pages.geminiSettings.title") : undefined}
        onClick={() => setOpen(true)}
      >
        {icon ?? t("pages.geminiSettings.title")}
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
          <h2 id={titleId}>{t("pages.geminiSettings.title")}</h2>
          <p className="small">
            <Trans
              i18nKey="pages.geminiSettings.description"
              components={{ generate: <strong />, generateMap: <strong /> }}
            />
          </p>
          <label className="field" htmlFor={keyId}>
            <span>{t("pages.geminiSettings.apiKey")}</span>
            <input
              id={keyId}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setModels(null);
                setVisionModels(null);
                setCheck({ state: "idle" });
              }}
            />
          </label>
          <label className="field" htmlFor={modelId}>
            <span>{t("pages.geminiSettings.model")}</span>
            {models && models.length > 0 ? (
              <select id={modelId} value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="">
                  {t("pages.geminiSettings.defaultModel", { model: DEFAULT_GEMINI_MODEL })}
                </option>
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
          <label className="field" htmlFor={visionId}>
            <span>{t("pages.geminiSettings.visionModel")}</span>
            {visionModels && visionModels.length > 0 ? (
              <select
                id={visionId}
                value={visionModel}
                onChange={(e) => setVisionModel(e.target.value)}
              >
                <option value="">
                  {t("pages.geminiSettings.automaticModel", {
                    model: pickDefaultVisionModel(visionModels),
                  })}
                </option>
                {visionModel && !visionModels.some((m) => m.id === visionModel) && (
                  <option value={visionModel}>{visionModel}</option>
                )}
                {visionModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName === m.id ? m.id : `${m.displayName} (${m.id})`}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={visionId}
                value={visionModel}
                placeholder={t("pages.geminiSettings.visionPlaceholder", {
                  model: DEFAULT_VISION_MODEL,
                })}
                spellCheck={false}
                onChange={(e) => setVisionModel(e.target.value)}
              />
            )}
          </label>
          {models && models.length === 0 && (
            <p className="muted small">{t("pages.geminiSettings.noImageModels")}</p>
          )}
          <p className="muted small">{t("pages.geminiSettings.privacy")}</p>
          {check.state === "ok" && (
            <p role="status">
              {models
                ? t("pages.geminiSettings.validKeyWithModels", { count: models.length })
                : t("pages.geminiSettings.validKey")}
            </p>
          )}
          {check.state === "error" && (
            <p className="error">
              {check.error instanceof GeminiError
                ? t(`pages.geminiSettings.errors.${check.error.code}`)
                : t("pages.geminiSettings.testFailed")}
            </p>
          )}
          <div className="modal-actions">
            <button
              type="button"
              disabled={!apiKey.trim() || check.state === "testing"}
              onClick={() => void test()}
            >
              {check.state === "testing"
                ? t("pages.geminiSettings.testing")
                : t("pages.geminiSettings.testKey")}
            </button>
            <button
              type="button"
              className="danger"
              disabled={!apiKey && !storage.getGeminiKey()}
              onClick={() => {
                storage.setGeminiKey(null);
                setApiKey("");
                setModels(null);
                setVisionModels(null);
                setCheck({ state: "idle" });
              }}
            >
              {t("pages.geminiSettings.forgetKey")}
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                save();
                setOpen(false);
              }}
            >
              {t("pages.geminiSettings.save")}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
