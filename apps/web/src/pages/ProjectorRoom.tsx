import type { Role, RoomInfo } from "@scryboard/shared";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AssetAuthContext } from "../board/assetAuth";
import { Board } from "../board/Board";
import { BoardStore } from "../board/store";
import { useRoomConnection } from "../hooks/useRoomConnection";
import { storage } from "../lib/storage";

/** Colore neutro dello schermo condiviso nell'elenco di chi è al tavolo. */
const PROJECTOR_COLOR = "#6f6e77";

/** Per il server lo schermo è un giocatore: riceve solo il documento pubblico. */
const PROJECTOR_ROLE: Role = "player";

/**
 * Schermo condiviso al tavolo (TV, proiettore): solo la lavagna, come la vedono i giocatori, con
 * la vista che segue il gruppo. Entra senza chiedere il nome, con un'identità tutta sua.
 */
export function ProjectorRoom({ room }: { room: RoomInfo }) {
  const { t } = useTranslation();
  const [profile] = useState(() => ({
    ...storage.getProjectorIdentity(),
    name: t("pages.projector.name"),
    color: PROJECTOR_COLOR,
  }));
  const { status, provider, sceneId } = useRoomConnection({
    roomId: room.id,
    gmToken: null,
    profile,
    projector: true,
  });
  const store = useMemo(
    () => (provider ? new BoardStore(provider.document, null, profile.id) : null),
    [provider, profile.id],
  );
  useEffect(() => () => store?.destroy(), [store]);
  useEffect(() => {
    document.title = `${room.name} · ${t("pages.projector.name")}`;
  }, [room.name, t]);

  return (
    <div className="projector-room">
      <main className="board-area">
        {store && provider ? (
          <AssetAuthContext.Provider value={null}>
            <Board
              key={sceneId}
              store={store}
              provider={provider}
              roomId={room.id}
              sceneId={sceneId ?? "main"}
              role={PROJECTOR_ROLE}
              projector
            />
          </AssetAuthContext.Provider>
        ) : (
          <div className="board-placeholder muted">{t("pages.room.boardConnecting")}</div>
        )}
      </main>
      {status !== "connected" && (
        <p className={`projector-status status status-${status}`} role="status">
          {t(`pages.room.status.${status}`)}
        </p>
      )}
      <FullscreenButton />
    </div>
  );
}

/** Lo schermo intero va chiesto con un gesto: il pulsante resta discreto in un angolo. */
function FullscreenButton() {
  const { t } = useTranslation();
  const [fullscreen, setFullscreen] = useState(() => document.fullscreenElement !== null);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  if (fullscreen || !document.fullscreenEnabled) return null;
  return (
    <button
      type="button"
      className="projector-fullscreen"
      onClick={() => void document.documentElement.requestFullscreen().catch(() => {})}
    >
      {t("pages.projector.fullscreen")}
    </button>
  );
}
