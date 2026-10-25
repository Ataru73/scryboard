import { type FormEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, describeApiError } from "../lib/api";
import { gmLink } from "../lib/links";
import { navigate } from "../lib/router";
import { CreditsButton } from "./Credits";

export function HomePage() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{
    action: "create" | "import";
    error: unknown;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    let room: Awaited<ReturnType<typeof api.createRoom>>;
    try {
      room = await api.createRoom(name);
    } catch (err) {
      console.error("Creazione stanza fallita", err);
      setError({ action: "create", error: err });
      setBusy(false);
      return;
    }
    navigate(gmLink("", room.id, room.gmToken));
  }

  /** Crea una stanza nuova da un archivio .scryboard esportato in precedenza. */
  async function onImport(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const room = await api.importRoom(file);
      navigate(gmLink("", room.id, room.gmToken));
    } catch (err) {
      setError({ action: "import", error: err });
      setBusy(false);
    }
  }

  return (
    <main className="centered">
      <div className="card">
        <h1 className="brand">Scryboard</h1>
        <p className="muted">{t("pages.home.tagline")}</p>
        <form onSubmit={onSubmit} className="stack">
          <label className="field">
            <span>{t("pages.home.roomName")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("pages.home.roomNamePlaceholder")}
              maxLength={80}
              required
            />
          </label>
          <button type="submit" className="primary" disabled={busy || !name.trim()}>
            {busy ? t("pages.home.creating") : t("pages.home.createRoom")}
          </button>
          {error && (
            <p className="error">
              {t(`pages.home.${error.action}Error`, {
                error: describeApiError(error.error),
              })}
            </p>
          )}
        </form>
        <p className="muted small">
          {t("pages.home.importPrompt")}{" "}
          <button
            type="button"
            className="link-button"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {t("pages.home.importRoom")}
          </button>
        </p>
        <input
          ref={fileInput}
          type="file"
          accept=".scryboard,application/octet-stream"
          hidden
          aria-label={t("pages.home.importFileAria")}
          onChange={(e) => {
            void onImport(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <p className="muted small attribution">
          {t("pages.poweredBy")} · <CreditsButton className="link-button" />
        </p>
      </div>
    </main>
  );
}
