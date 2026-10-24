import { PORTRAITS } from "@scryboard/shared";
import { type ReactNode, useId, useState } from "react";

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
  const [open, setOpen] = useState(false);
  const titleId = useId();
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={icon ? "Crediti" : undefined}
        title={icon ? "Crediti" : undefined}
        onClick={() => setOpen(true)}
      >
        {icon ?? "Crediti"}
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
          <h2 id={titleId}>Crediti</h2>
          <p className="small">
            Le immagini della libreria dei token sono sagome di{" "}
            <a href="https://game-icons.net" target="_blank" rel="noreferrer">
              game-icons.net
            </a>
            , distribuite con licenza{" "}
            <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">
              Creative Commons Attribution 3.0
            </a>
            . Icons made by:
          </p>
          <ul className="credits-list small">
            {AUTHORS.map(([author, count]) => (
              <li key={author}>
                {author} <span className="muted">({count})</span>
              </li>
            ))}
          </ul>
          <div className="modal-actions">
            <button type="button" onClick={() => setOpen(false)}>
              Chiudi
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
