import type { RoomInfo } from "@scryboard/shared";
import { useEffect, useId, useMemo, useState } from "react";
import { AssetAuthContext } from "../board/assetAuth";
import { Board } from "../board/Board";
import { BoardStore } from "../board/store";
import { type ConnectionStatus, useRoomConnection } from "../hooks/useRoomConnection";
import { ApiRequestError, api } from "../lib/api";
import { gmLink, gmTokenFromHash, playerLink } from "../lib/links";
import { type Profile, storage } from "../lib/storage";
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

  if (load.state === "loading") return <main className="centered muted">Caricamento…</main>;
  if (load.state === "not-found") {
    return (
      <main className="centered">
        <div className="card">
          <h2>Stanza non trovata</h2>
          <p className="muted">Controlla il link ricevuto dal tuo GM.</p>
          <a href="/">Crea una nuova stanza</a>
        </div>
      </main>
    );
  }
  if (load.state === "error") {
    return (
      <main className="centered error">Impossibile contattare il server. Riprova più tardi.</main>
    );
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

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: "Connessione…",
  connected: "Connesso",
  disconnected: "Disconnesso, riconnessione…",
  denied: "Accesso negato",
};

function Room({
  room,
  gmToken,
  profile,
}: {
  room: RoomInfo;
  gmToken: string | null;
  profile: Profile;
}) {
  const { status, users, provider, gmProvider } = useRoomConnection({
    roomId: room.id,
    gmToken,
    profile,
  });
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

  return (
    <div className="room">
      <header className="room-header">
        <a href="/" className="brand small">
          Scryboard
        </a>
        <h1>{room.name}</h1>
        <span className={`status status-${status}`}>{STATUS_LABEL[status]}</span>
      </header>
      <aside className="sidebar">
        {gmToken && <SharePanel roomId={room.id} gmToken={gmToken} />}
        <section>
          <h2>Al tavolo ({users.length})</h2>
          <ul className="users">
            {users.map((u) => (
              <li key={u.clientId}>
                <span className="dot" style={{ background: u.color }} />
                {u.name}
                {u.isSelf && <span className="muted"> (tu)</span>}
                {u.role === "gm" && <span className="badge">GM</span>}
              </li>
            ))}
          </ul>
        </section>
      </aside>
      <main className="board-area">
        {store && provider ? (
          <AssetAuthContext.Provider value={gmToken}>
            <Board
              store={store}
              provider={provider}
              roomId={room.id}
              role={gmToken ? "gm" : "player"}
            />
          </AssetAuthContext.Provider>
        ) : (
          <div className="board-placeholder muted">Connessione alla lavagna…</div>
        )}
      </main>
    </div>
  );
}

function SharePanel({ roomId, gmToken }: { roomId: string; gmToken: string }) {
  const origin = window.location.origin;
  return (
    <section className="stack">
      <h2>Condividi</h2>
      <CopyField label="Link per i giocatori" value={playerLink(origin, roomId)} />
      <CopyField label="Link GM (tienilo segreto)" value={gmLink(origin, roomId, gmToken)} secret />
    </section>
  );
}

function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
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
          {copied ? "Copiato" : "Copia"}
        </button>
      </div>
    </div>
  );
}
