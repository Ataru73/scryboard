import { assetUrl, type Handout, type Role } from "@scryboard/shared";
import { createContext, useContext, useId, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { BoardStore } from "./store";
import { useImage } from "./useImage";

/**
 * Mostra un'immagine a tutto schermo ai giocatori: c'è solo per il GM. Serve ai pannelli lontani
 * dallo store, come la scheda «Caricati».
 */
export const ShowHandoutContext = createContext<((assetId: string) => void) | null>(null);

export const useShowHandout = () => useContext(ShowHandoutContext);

interface Props {
  store: BoardStore;
  role: Role;
  roomId: string;
}

/**
 * Immagine che il GM mostra a tutti a tutto schermo. Il giocatore la chiude solo per sé (si
 * riapre se il GM la mostra di nuovo); il GM, che deve poter continuare a giocare, vede solo
 * un avviso da cui smettere di mostrarla a tutti.
 */
export function HandoutModal({ store, role, roomId }: Props) {
  const { t } = useTranslation();
  const handout = useSyncExternalStore(store.subscribe, store.getHandout);
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!handout || handout.id === dismissed) return null;
  if (role === "gm") {
    return (
      <div className="board-notice handout-banner" role="status">
        <span>{t("effects.handout.showing")}</span>
        <button type="button" onClick={() => store.showHandout(null)}>
          {t("effects.handout.stop")}
        </button>
      </div>
    );
  }
  return (
    <HandoutDialog
      key={handout.id}
      handout={handout}
      roomId={roomId}
      onClose={() => setDismissed(handout.id)}
    />
  );
}

function HandoutDialog({
  handout,
  roomId,
  onClose,
}: {
  handout: Handout;
  roomId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const image = useImage(assetUrl(roomId, handout.assetId));
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc chiude nativamente <dialog>.
    <dialog
      ref={(el) => {
        if (el && !el.open) el.showModal();
      }}
      className="card stack modal handout-modal"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <h2 id={titleId} className="visually-hidden">
        {t("effects.handout.title")}
      </h2>
      {image ? (
        <img src={image.src} alt={t("effects.handout.alt")} className="handout-image" />
      ) : (
        <p className="muted small" role="status">
          {t("effects.handout.loading")}
        </p>
      )}
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          {t("effects.handout.close")}
        </button>
      </div>
    </dialog>
  );
}
