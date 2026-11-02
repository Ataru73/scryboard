import type { Role } from "@scryboard/shared";
import { useId } from "react";
import { useTranslation } from "react-i18next";

interface Shortcut {
  /** Tasti da premere; «space» si traduce. */
  keys: string;
  id: string;
  gmOnly?: boolean;
}

const SHORTCUTS: Shortcut[] = [
  { keys: "V H P L R O T E K C", id: "tools" },
  { keys: "M", id: "ruler" },
  { keys: "Q", id: "laser" },
  { keys: "B J W I S F A U", id: "gmTools", gmOnly: true },
  { keys: "space", id: "pan" },
  { keys: "Alt", id: "free" },
  { keys: "N / Shift+N", id: "turn", gmOnly: true },
  { keys: "D", id: "damage" },
  { keys: "Shift+H", id: "hide", gmOnly: true },
  { keys: "Ctrl+D", id: "duplicate" },
  { keys: "Del", id: "delete" },
  { keys: "] / [", id: "order" },
  { keys: "Ctrl+Z / Ctrl+Shift+Z", id: "undo" },
  { keys: "Shift+1 / Shift+0", id: "zoom" },
  { keys: "Esc", id: "escape" },
  { keys: "?", id: "help" },
];

/** Elenco delle scorciatoie da tastiera, aperto con «?». */
export function ShortcutsDialog({ role, onClose }: { role: Role; onClose: () => void }) {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc chiude nativamente <dialog>.
    <dialog
      ref={(el) => {
        if (el && !el.open) el.showModal();
      }}
      className="card stack modal shortcuts-modal"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <h2 id={titleId}>{t("effects.shortcuts.title")}</h2>
      <dl className="shortcuts-list">
        {SHORTCUTS.filter((s) => role === "gm" || !s.gmOnly).map((s) => (
          <div key={s.id}>
            <dt>
              <kbd>{s.keys === "space" ? t("effects.shortcuts.space") : s.keys}</kbd>
            </dt>
            <dd>{t(`effects.shortcuts.items.${s.id}`)}</dd>
          </div>
        ))}
      </dl>
      <div className="modal-actions">
        <button type="button" className="primary" onClick={onClose}>
          {t("effects.shortcuts.close")}
        </button>
      </div>
    </dialog>
  );
}
