import { Database } from "@hocuspocus/extension-database";
import { Hocuspocus } from "@hocuspocus/server";
import {
  ACTIVE_SCENE_KEY,
  GM_MAILBOX,
  META_MAP,
  parsePlayerCredentials,
  parseRoomDocumentName,
  type Role,
} from "@scryboard/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { documents } from "../db/schema";
import type { PlayerService } from "../rooms/players";
import type { SceneService } from "../rooms/scenes";
import type { RoomService } from "../rooms/service";
import { guardPublicDocument } from "./guard";

export interface ConnectionContext {
  roomId: string;
  role: Role;
}

export function createCollab(
  db: Db,
  rooms: RoomService,
  players: PlayerService,
  scenes: SceneService,
): Hocuspocus<ConnectionContext> {
  return new Hocuspocus<ConnectionContext>({
    name: "scryboard",
    quiet: true,
    debounce: 2000,
    maxDebounce: 10000,

    async onAuthenticate({ documentName, token, connectionConfig }): Promise<ConnectionContext> {
      const parsed = parseRoomDocumentName(documentName);
      if (!parsed || !rooms.get(parsed.roomId)) throw new Error("Stanza non trovata");
      if (parsed.scope === "mail") {
        // Caselle di posta: le legge solo il proprietario (il GM la sua, che contiene tutto) e
        // nessuno ci scrive direttamente, i messaggi li consegna il server.
        connectionConfig.readOnly = true;
        if (parsed.mailbox === GM_MAILBOX) {
          if (!rooms.isGmToken(parsed.roomId, token)) throw new Error("Accesso negato");
          rooms.touch(parsed.roomId);
          return { roomId: parsed.roomId, role: "gm" };
        }
        const credentials = parsePlayerCredentials(token);
        if (
          !credentials ||
          credentials.profileId !== parsed.mailbox ||
          !players.authenticate(parsed.roomId, credentials.profileId, credentials.secret)
        ) {
          throw new Error("Accesso negato");
        }
        rooms.touch(parsed.roomId);
        return { roomId: parsed.roomId, role: "player" };
      }
      const isGm = rooms.isGmToken(parsed.roomId, token);
      if (parsed.scope === "meta") {
        // La scena attiva la scrive solo il server; la leggono tutti.
        connectionConfig.readOnly = true;
        rooms.touch(parsed.roomId);
        return { roomId: parsed.roomId, role: isGm ? "gm" : "player" };
      }
      // Una scena esiste solo se il GM l'ha creata e i giocatori entrano solo in quella attiva.
      if (!scenes.has(parsed.roomId, parsed.sceneId)) throw new Error("Scena non trovata");
      if (!isGm && parsed.sceneId !== scenes.activeId(parsed.roomId)) {
        throw new Error("Scena non attiva");
      }
      // Il documento del GM contiene gli oggetti nascosti: i giocatori non devono mai riceverlo.
      if (parsed.scope === "gm" && !isGm) throw new Error("Accesso negato");
      rooms.touch(parsed.roomId);
      return { roomId: parsed.roomId, role: isGm ? "gm" : "player" };
    },

    async afterLoadDocument({ document, documentName }) {
      const parsed = parseRoomDocumentName(documentName);
      if (parsed?.scope === "public") guardPublicDocument(document);
      if (parsed?.scope === "meta") {
        // Le stanze create prima delle scene non hanno ancora il documento: lo si riempie qui.
        const meta = document.getMap<string>(META_MAP);
        const active = scenes.activeId(parsed.roomId);
        if (meta.get(ACTIVE_SCENE_KEY) !== active) meta.set(ACTIVE_SCENE_KEY, active);
      }
    },

    extensions: [
      new Database({
        async fetch({ documentName }) {
          const row = db
            .select({ state: documents.state })
            .from(documents)
            .where(eq(documents.name, documentName))
            .get();
          return row ? new Uint8Array(row.state) : null;
        },
        async store({ documentName, state }) {
          const roomId = parseRoomDocumentName(documentName)?.roomId;
          if (roomId) rooms.touch(roomId);
          const updatedAt = new Date().toISOString();
          db.insert(documents)
            .values({ name: documentName, state, updatedAt })
            .onConflictDoUpdate({ target: documents.name, set: { state, updatedAt } })
            .run();
        },
      }),
    ],
  });
}
