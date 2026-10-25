import { GM_MAILBOX, playerCredentials, type RoomInfo } from "@scryboard/shared";
import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AssetAuthContext } from "../board/assetAuth";
import { Board } from "../board/Board";
import { InfoIcon, SettingsIcon, SidebarIcon } from "../board/icons";
import { BoardStore } from "../board/store";
import { type ConnectionStatus, useRoomConnection } from "../hooks/useRoomConnection";
import { ApiRequestError, api, describeApiError } from "../lib/api";
import { gmLink, gmTokenFromHash, playerLink } from "../lib/links";
import { type Profile, storage } from "../lib/storage";
import { MessagesPanel } from "../messages/MessagesPanel";
import { ScenesPanel } from "../scenes/ScenesPanel";
import { useScenes } from "../scenes/useScenes";
import { CreditsButton } from "./Credits";
import { SettingsButton } from "./GeminiSettings";
import { ProfileForm } from "./ProfileForm";

type Load =
  | { state: "loading" }
  | { state: "not-found" }
  | { state: "error" }
  | { state: "ready"; room: RoomInfo; gmToken: string | null };

/** Legge il token GM dall'URL (poi lo rimuove) o da localStorage e lo verifica col server. */
async function loadRoom(roomId: string): Promise<Load> {
  const fromHash = gmTokenFromHash(window.location.hash);
  if (fromHash) {
    storage.setGmToken(roomId, fromHash);
    history.replaceState(null, "", window.location.pathname);
  }
  try {
    const room = await api.getRoom(roomId);
    let gmToken = fromHash ?? storage.getGmToken(roomId);
    if (gmToken && !(await api.checkGmToken(roomId, gmToken))) {
      storage.setGmToken(roomId, null);
      gmToken = null;
    }
    return { state: "ready", room, gmToken };
  } catch (error) {
    return error instanceof ApiRequestError && error.status === 404
      ? { state: "not-found" }
      : { state: "error" };
  }
}

export function RoomPage({ roomId }: { roomId: string }) {
  const { t } = useTranslation();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [profile, setProfile] = useState(storage.getProfile);

  useEffect(() => {
    let cancelled = false;
    loadRoom(roomId).then((result) => {
      if (!cancelled) setLoad(result);
    });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  if (load.state === "loading") {
    return <main className="centered muted">{t("pages.room.loading")}</main>;
  }
  if (load.state === "not-found") {
    return (
      <main className="centered">
        <div className="card">
          <h2>{t("pages.room.notFoundTitle")}</h2>
          <p className="muted">{t("pages.room.notFoundDescription")}</p>
          <a href="/">{t("pages.room.createNewRoom")}</a>
        </div>
      </main>
    );
  }
  if (load.state === "error") {
    return <main className="centered error">{t("pages.room.serverError")}</main>;
  }
  if (!profile) {
    return (
      <ProfileForm
        roomName={load.room.name}
        isGm={load.gmToken !== null}
        onSubmit={(p) => {
          storage.setProfile(p);
          setProfile(p);
        }}
      />
    );
  }
  return <Room room={load.room} gmToken={load.gmToken} profile={profile} />;
}

function Room({
  room,
  gmToken,
  profile,
}: {
  room: RoomInfo;
  gmToken: string | null;
  profile: Profile;
}) {
  const { t } = useTranslation();
  const statusLabel: Record<ConnectionStatus, string> = {
    connecting: t("pages.room.status.connecting"),
    connected: t("pages.room.status.connected"),
    disconnected: t("pages.room.status.disconnected"),
    idle: t("pages.room.status.idle"),
    denied: t("pages.room.status.denied"),
  };
  // Il GM può aprire una scena diversa da quella dei giocatori per prepararla.
  const [viewScene, setViewScene] = useState<string | null>(null);
  const { status, users, provider, gmProvider, mailProvider, activeScene, sceneId, sceneFailed } =
    useRoomConnection({ roomId: room.id, gmToken, profile, viewScene });
  const scenes = useScenes(room.id, gmToken, activeScene);
  // Se la scena aperta non c'è più (cancellata) si torna a quella dei giocatori.
  useEffect(() => {
    if (sceneFailed && viewScene) setViewScene(null);
  }, [sceneFailed, viewScene]);
  const sceneName = (id: string | null) => scenes.scenes.find((s) => s.id === id)?.name ?? "…";
  // Il GM aspetta anche il documento degli oggetti nascosti, così lo store nasce completo.
  const ready = provider !== null && (gmToken === null || gmProvider !== null);
  const store = useMemo(
    () =>
      ready && provider
        ? new BoardStore(provider.document, gmProvider?.document ?? null, profile.id)
        : null,
    [ready, provider, gmProvider, profile.id],
  );
  useEffect(() => () => store?.destroy(), [store]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarId = useId();
  const sidebarToggleLabel = t(
    sidebarCollapsed ? "pages.room.expandSidebar" : "pages.room.collapseSidebar",
  );

  return (
    <div className={sidebarCollapsed ? "room sidebar-collapsed" : "room"}>
      <header className="room-header">
        <button
          type="button"
          className="icon-button"
          aria-expanded={!sidebarCollapsed}
          aria-controls={sidebarId}
          aria-label={sidebarToggleLabel}
          title={sidebarToggleLabel}
          onClick={() => setSidebarCollapsed((c) => !c)}
        >
          {SidebarIcon}
        </button>
        <a href="/" className="brand small">
          Scryboard
        </a>
        <h1>{room.name}</h1>
        <span className={`status status-${status}`}>{statusLabel[status]}</span>
        <SettingsButton className="icon-button" icon={SettingsIcon} />
        <CreditsButton className="icon-button" icon={InfoIcon} />
      </header>
      <aside id={sidebarId} className="sidebar" hidden={sidebarCollapsed}>
        {gmToken && <SharePanel roomId={room.id} roomName={room.name} gmToken={gmToken} />}
        {gmToken && (
          <ScenesPanel
            roomId={room.id}
            gmToken={gmToken}
            activeScene={activeScene}
            viewScene={sceneId}
            onOpen={setViewScene}
            scenes={scenes}
          />
        )}
        <section>
          <h2>{t("pages.room.atTable", { count: users.length })}</h2>
          <ul className="users" aria-label={t("pages.room.atTableLabel")}>
            {users.map((u) => (
              <li key={u.clientId}>
                <span className="dot" style={{ background: u.color }} />
                {u.name}
                {u.isSelf && <span className="muted"> {t("pages.room.self")}</span>}
                {u.role === "gm" && <span className="badge">GM</span>}
              </li>
            ))}
          </ul>
        </section>
        <MessagesPanel
          roomId={room.id}
          me={gmToken ? GM_MAILBOX : profile.id}
          myName={profile.name}
          mailProvider={mailProvider}
          provider={provider}
          users={users}
          auth={
            gmToken ? { gmToken } : { credentials: playerCredentials(profile.id, profile.secret) }
          }
        />
        <p className="muted small attribution">{t("pages.poweredBy")}</p>
      </aside>
      <main className="board-area">
        {gmToken && sceneId && activeScene && sceneId !== activeScene && (
          <div className="scene-banner" role="status">
            {t("pages.room.preparingScene", {
              viewing: sceneName(sceneId),
              active: sceneName(activeScene),
            })}
            <button type="button" onClick={() => setViewScene(activeScene)}>
              {t("pages.room.returnToPlayers")}
            </button>
          </div>
        )}
        {store && provider ? (
          <AssetAuthContext.Provider value={gmToken}>
            <Board
              key={sceneId}
              store={store}
              provider={provider}
              roomId={room.id}
              sceneId={sceneId ?? "main"}
              role={gmToken ? "gm" : "player"}
            />
          </AssetAuthContext.Provider>
        ) : (
          <div className="board-placeholder muted">{t("pages.room.boardConnecting")}</div>
        )}
      </main>
    </div>
  );
}

function SharePanel({
  roomId,
  roomName,
  gmToken,
}: {
  roomId: string;
  roomName: string;
  gmToken: string;
}) {
  const { t } = useTranslation();
  const origin = window.location.origin;
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<{ error: unknown } | null>(null);

  /** Scarica la stanza (scene, nascosti, immagini) in un file .scryboard da riaprire in seguito. */
  async function exportRoom() {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await api.exportRoom(roomId, gmToken);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${roomName.replace(/[\\/:*?"<>|]+/g, "_")}.scryboard`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    } catch (e) {
      setExportError({ error: e });
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="stack">
      <h2>{t("pages.room.share.title")}</h2>
      <CopyField label={t("pages.room.share.playerLink")} value={playerLink(origin, roomId)} />
      <CopyField
        label={t("pages.room.share.gmLink")}
        value={gmLink(origin, roomId, gmToken)}
        secret
      />
      <button
        type="button"
        disabled={exporting}
        title={t("pages.room.share.exportTitle")}
        onClick={() => void exportRoom()}
      >
        {exporting ? t("pages.room.share.exporting") : t("pages.room.share.exportRoom")}
      </button>
      {exportError && (
        <p className="error small" role="alert">
          {describeApiError(exportError.error)}
        </p>
      )}
    </section>
  );
}

function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const id = useId();
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard non disponibile: l'utente può selezionare il testo a mano.
    }
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="copy-row">
        <input
          id={id}
          readOnly
          value={value}
          type={secret ? "password" : "text"}
          onFocus={(e) => e.target.select()}
        />
        <button type="button" onClick={copy}>
          {copied ? t("pages.room.share.copied") : t("pages.room.share.copy")}
        </button>
      </div>
    </div>
  );
}
