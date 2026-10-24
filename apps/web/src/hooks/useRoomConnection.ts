import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { type PresenceUser, roomDocumentName } from "@scryboard/shared";
import { useEffect, useState } from "react";
import * as Y from "yjs";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "denied";

export interface ConnectedUser extends PresenceUser {
  clientId: number;
  isSelf: boolean;
}

interface Options {
  roomId: string;
  gmToken: string | null;
  profile: { id: string; name: string; color: string };
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

  useEffect(() => {
    const socket = new HocuspocusProviderWebsocket({ url: collabUrl() });
    const role = gmToken ? "gm" : "player";

    const publicProvider = new HocuspocusProvider({
      websocketProvider: socket,
      name: roomDocumentName(roomId, "public"),
      document: new Y.Doc(),
      // Il server assegna il ruolo in base al token; i giocatori ne inviano uno qualsiasi.
      token: gmToken ?? "player",
      onStatus: ({ status }) => setStatus((prev) => (prev === "denied" ? prev : status)),
      onAuthenticationFailed: () => setStatus("denied"),
      onAwarenessChange: ({ states }) => {
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

    return () => {
      setProvider(null);
      setGmProvider(null);
      publicProvider.destroy();
      gmProvider?.destroy();
      socket.destroy();
    };
  }, [roomId, gmToken, profile]);

  return { status, users, provider, gmProvider };
}
