import { Database } from "@hocuspocus/extension-database";
import { Hocuspocus } from "@hocuspocus/server";
import { parseRoomDocumentName, type Role } from "@scryboard/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { documents } from "../db/schema";
import type { RoomService } from "../rooms/service";
import { guardPublicDocument } from "./guard";

export interface ConnectionContext {
  roomId: string;
  role: Role;
}

export function createCollab(db: Db, rooms: RoomService): Hocuspocus<ConnectionContext> {
  return new Hocuspocus<ConnectionContext>({
    name: "scryboard",
    quiet: true,
    debounce: 2000,
    maxDebounce: 10000,

    async onAuthenticate({ documentName, token }): Promise<ConnectionContext> {
      const parsed = parseRoomDocumentName(documentName);
      if (!parsed || !rooms.get(parsed.roomId)) throw new Error("Stanza non trovata");
      const isGm = rooms.isGmToken(parsed.roomId, token);
      // Il documento del GM contiene gli oggetti nascosti: i giocatori non devono mai riceverlo.
      if (parsed.scope === "gm" && !isGm) throw new Error("Accesso negato");
      return { roomId: parsed.roomId, role: isGm ? "gm" : "player" };
    },

    async afterLoadDocument({ document, documentName }) {
      if (parseRoomDocumentName(documentName)?.scope === "public") guardPublicDocument(document);
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
