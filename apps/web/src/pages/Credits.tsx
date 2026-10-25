import { PORTRAITS } from "@scryboard/shared";
import { type ReactNode, useId, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

/** Autori delle immagini della libreria, con il numero di sagome di ciascuno. */
const AUTHORS = Object.entries(
  PORTRAITS.reduce<Record<string, number>>((acc, p) => {
    acc[p.author] = (acc[p.author] ?? 0) + 1;
    return acc;
  }, {}),
).sort(([a], [b]) => a.localeCompare(b));

/** Pulsante "Crediti" che apre la finestra con autori e licenze, come richiede CC BY. */
/** Con `icon` il pulsante mostra solo l'icona; il nome resta per screen reader e tooltip. */
export function CreditsButton({ className, icon }: { className?: string; icon?: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={icon ? t("pages.credits.title") : undefined}
        title={icon ? t("pages.credits.title") : undefined}
        onClick={() => setOpen(true)}
      >
        {icon ?? t("pages.credits.title")}
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
          <h2 id={titleId}>{t("pages.credits.title")}</h2>
          <p className="small">
            <Trans
              i18nKey="pages.credits.description"
              components={{
                gameIcons: (
                  <a href="https://game-icons.net" target="_blank" rel="noreferrer">
                    game-icons.net
                  </a>
                ),
                license: (
                  <a
                    href="https://creativecommons.org/licenses/by/3.0/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Creative Commons Attribution 3.0
                  </a>
                ),
              }}
            />
          </p>
          <ul className="credits-list small">
            {AUTHORS.map(([author, count]) => (
              <li key={author}>
                {author} <span className="muted">{t("pages.credits.imageCount", { count })}</span>
              </li>
            ))}
          </ul>
          <div className="modal-actions">
            <button type="button" onClick={() => setOpen(false)}>
              {t("pages.credits.close")}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
