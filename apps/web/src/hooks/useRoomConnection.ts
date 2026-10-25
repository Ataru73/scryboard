import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import {
  GM_MAILBOX,
  mailDocumentName,
  type PresenceUser,
  playerCredentials,
  roomDocumentName,
} from "@scryboard/shared";
import { useEffect, useState } from "react";
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
}

function collabUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/collab`;
}

/**
 * Si connette ai documenti della stanza su un unico WebSocket: il documento pubblico sempre,
 * quello del GM solo se si possiede il token.
 */
export function useRoomConnection({ roomId, gmToken, profile }: Options) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [users, setUsers] = useState<ConnectedUser[]>([]);
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [gmProvider, setGmProvider] = useState<HocuspocusProvider | null>(null);
  const [mailProvider, setMailProvider] = useState<HocuspocusProvider | null>(null);

  useEffect(() => {
    const socket = new HocuspocusProviderWebsocket({ url: collabUrl() });
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

    const publicProvider = new HocuspocusProvider({
      websocketProvider: socket,
      name: roomDocumentName(roomId, "public"),
      document: new Y.Doc(),
      // Il server assegna il ruolo in base al token; i giocatori ne inviano uno qualsiasi.
      token: gmToken ?? "player",
      onStatus: ({ status }) =>
        setStatus((prev) => (prev === "denied" || (idle && prev === "idle") ? prev : status)),
      onAuthenticationFailed: () => setStatus("denied"),
      onAwarenessChange: ({ states }) => {
        onRemoteActivity();
        const selfId = publicProvider.awareness?.clientID;
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
    publicProvider.setAwarenessField("user", user);
    publicProvider.document.on("update", onRemoteActivity);
    publicProvider.attach();
    setProvider(publicProvider);

    const gmProvider = gmToken
      ? new HocuspocusProvider({
          websocketProvider: socket,
          name: roomDocumentName(roomId, "gm"),
          document: new Y.Doc(),
          token: gmToken,
        })
      : null;
    gmProvider?.attach();
    setGmProvider(gmProvider);

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
      setProvider(null);
      setGmProvider(null);
      setMailProvider(null);
      publicProvider.destroy();
      gmProvider?.destroy();
      mailProvider.destroy();
      socket.destroy();
    };
  }, [roomId, gmToken, profile]);

  return { status, users, provider, gmProvider, mailProvider };
}
