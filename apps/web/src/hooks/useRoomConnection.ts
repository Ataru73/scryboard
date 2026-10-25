import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import {
  ACTIVE_SCENE_KEY,
  GM_MAILBOX,
  META_MAP,
  mailDocumentName,
  metaDocumentName,
  type PresenceUser,
  playerCredentials,
  roomDocumentName,
} from "@scryboard/shared";
import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "idle" | "denied";

/**
 * Dopo tanto tempo senza attività (propria o degli altri nella stanza) ci si disconnette: senza
 * connessioni aperte il server può spegnersi. Alla prima interazione si riprende.
 */
export const IDLE_DISCONNECT_MS = 10 * 60 * 1000;
/** Gli eventi dell'utente rimandano il timer al massimo una volta a questo intervallo. */
const ACTIVITY_THROTTLE_MS = 1000;
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

export interface ConnectedUser extends PresenceUser {
  clientId: number;
  isSelf: boolean;
}

interface Options {
  roomId: string;
  gmToken: string | null;
  profile: { id: string; name: string; color: string; secret: string };
  /** Solo GM: scena da aprire per prepararla; di default quella dei giocatori. */
  viewScene?: string | null;
}

function collabUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/collab`;
}

/**
 * Si connette ai documenti della stanza su un unico WebSocket. Quelli di tutta la stanza (scena
 * attiva, presenze, messaggi privati) restano aperti sempre; quelli della scena (pubblico e,
 * per il GM, nascosto) si riaprono quando cambia la scena che si sta guardando. I giocatori
 * guardano sempre la scena attiva; il GM può aprirne un'altra per prepararla.
 */
export function useRoomConnection({ roomId, gmToken, profile, viewScene = null }: Options) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [users, setUsers] = useState<ConnectedUser[]>([]);
  const [socket, setSocket] = useState<HocuspocusProviderWebsocket | null>(null);
  const [activeScene, setActiveScene] = useState<string | null>(null);
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [gmProvider, setGmProvider] = useState<HocuspocusProvider | null>(null);
  const [mailProvider, setMailProvider] = useState<HocuspocusProvider | null>(null);
  /** La scena richiesta non si può aprire (cancellata o non più attiva). */
  const [sceneFailed, setSceneFailed] = useState(false);
  /** Attività altrui nei documenti della scena: tiene sveglia la connessione. */
  const remoteActivity = useRef<() => void>(() => {});

  // Il GM non aspetta di sapere dov'è il gruppo: apre subito la scena originale (e disegna anche
  // con la rete lenta), poi passa a quella attiva se è un'altra. I giocatori la aspettano.
  const sceneId = gmToken ? (viewScene ?? activeScene ?? "main") : activeScene;

  useEffect(() => {
    const socket = new HocuspocusProviderWebsocket({ url: collabUrl() });
    setSocket(socket);
    const role = gmToken ? "gm" : "player";

    let idle = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let lastActivity = 0;
    const goIdle = () => {
      idle = true;
      socket.disconnect();
      setStatus("idle");
    };
    const armIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(goIdle, IDLE_DISCONNECT_MS);
    };
    /** Attività propria: se eravamo disconnessi per inattività, si riconnette. */
    const onUserActivity = () => {
      const now = Date.now();
      if (!idle && now - lastActivity < ACTIVITY_THROTTLE_MS) return;
      lastActivity = now;
      if (idle) {
        idle = false;
        setStatus("connecting");
        void socket.connect();
      }
      armIdleTimer();
    };
    /** Attività altrui: modifiche al documento o presenze, solo mentre siamo connessi. */
    const onRemoteActivity = () => {
      if (!idle) armIdleTimer();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") onUserActivity();
    };
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, onUserActivity);
    document.addEventListener("visibilitychange", onVisibility);
    armIdleTimer();

    remoteActivity.current = onRemoteActivity;

    // Documento della stanza: scena attiva e presenze (chi c'è, in qualunque scena).
    const metaProvider = new HocuspocusProvider({
      websocketProvider: socket,
      name: metaDocumentName(roomId),
      document: new Y.Doc(),
      // Il server assegna il ruolo in base al token; i giocatori ne inviano uno qualsiasi.
      token: gmToken ?? "player",
      onStatus: ({ status }) =>
        setStatus((prev) => (prev === "denied" || (idle && prev === "idle") ? prev : status)),
      onAuthenticationFailed: () => setStatus("denied"),
      onAwarenessChange: ({ states }) => {
        onRemoteActivity();
        const selfId = metaProvider.awareness?.clientID;
        const next = states
          .filter((s) => s.user)
          .map((s) => ({
            ...(s.user as PresenceUser),
            clientId: s.clientId,
            isSelf: s.clientId === selfId,
          }))
          .sort(
            (a, b) =>
              Number(b.role === "gm") - Number(a.role === "gm") || a.name.localeCompare(b.name),
          );
        // L'awareness cambia a ogni movimento dei cursori: aggiorna solo se la lista è diversa.
        const key = JSON.stringify(next);
        if (key !== usersKey) {
          usersKey = key;
          setUsers(next);
        }
      },
    });
    let usersKey = "";
    const user: PresenceUser = { id: profile.id, name: profile.name, color: profile.color, role };
    metaProvider.setAwarenessField("user", user);
    metaProvider.document.on("update", onRemoteActivity);
    metaProvider.attach();
    const meta = metaProvider.document.getMap<unknown>(META_MAP);
    const readActive = () => {
      const value = meta.get(ACTIVE_SCENE_KEY);
      if (typeof value === "string") setActiveScene(value);
    };
    meta.observe(readActive);
    readActive();

    // Casella dei messaggi privati: il GM riceve tutto, ogni giocatore solo i suoi.
    const mailProvider = new HocuspocusProvider({
      websocketProvider: socket,
      name: mailDocumentName(roomId, gmToken ? GM_MAILBOX : profile.id),
      document: new Y.Doc(),
      token: gmToken ?? playerCredentials(profile.id, profile.secret),
    });
    mailProvider.attach();
    setMailProvider(mailProvider);

    return () => {
      clearTimeout(idleTimer);
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, onUserActivity);
      document.removeEventListener("visibilitychange", onVisibility);
      setSocket(null);
      setActiveScene(null);
      setMailProvider(null);
      metaProvider.destroy();
      mailProvider.destroy();
      socket.destroy();
    };
  }, [roomId, gmToken, profile]);

  // Documenti della scena che si sta guardando: si riaprono a ogni cambio di scena.
  useEffect(() => {
    if (!socket || !sceneId) return;
    setSceneFailed(false);
    const user: PresenceUser = {
      id: profile.id,
      name: profile.name,
      color: profile.color,
      role: gmToken ? "gm" : "player",
    };
    const scenePublic = new HocuspocusProvider({
      websocketProvider: socket,
      name: roomDocumentName(roomId, "public", sceneId),
      document: new Y.Doc(),
      token: gmToken ?? "player",
      onAuthenticationFailed: () => setSceneFailed(true),
    });
    scenePublic.setAwarenessField("user", user);
    scenePublic.document.on("update", () => remoteActivity.current());
    scenePublic.attach();
    setProvider(scenePublic);

    const sceneGm = gmToken
      ? new HocuspocusProvider({
          websocketProvider: socket,
          name: roomDocumentName(roomId, "gm", sceneId),
          document: new Y.Doc(),
          token: gmToken,
        })
      : null;
    sceneGm?.attach();
    setGmProvider(sceneGm);

    return () => {
      setProvider(null);
      setGmProvider(null);
      scenePublic.destroy();
      sceneGm?.destroy();
    };
  }, [socket, sceneId, roomId, gmToken, profile]);

  return { status, users, provider, gmProvider, mailProvider, activeScene, sceneId, sceneFailed };
}
