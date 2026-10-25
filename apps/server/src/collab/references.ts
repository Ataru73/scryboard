import type { Hocuspocus } from "@hocuspocus/server";
import { ITEMS_MAP, roomDocumentName } from "@scryboard/shared";
import { eq } from "drizzle-orm";
import * as Y from "yjs";
import type { PublicReferenceCheck } from "../assets/access";
import type { Db } from "../db/client";
import { documents } from "../db/schema";
import type { SceneService } from "../rooms/scenes";

/** Cerca l'asset tra gli oggetti del documento pubblico: in memoria se aperto, altrimenti su disco. */
export function publicReferenceCheck(
  collab: Hocuspocus,
  db: Db,
  scenes: SceneService,
): PublicReferenceCheck {
  return async (roomId, assetId) => {
    // Conta solo la scena dove si trovano i giocatori: quelle in preparazione restano private.
    const name = roomDocumentName(roomId, "public", scenes.activeId(roomId));
    let doc: Y.Doc | undefined = collab.documents.get(name);
    if (!doc) {
      const row = db
        .select({ state: documents.state })
        .from(documents)
        .where(eq(documents.name, name))
        .get();
      if (!row) return false;
      doc = new Y.Doc();
      Y.applyUpdate(doc, new Uint8Array(row.state));
    }
    for (const value of doc.getMap<unknown>(ITEMS_MAP).values()) {
      if ((value as { assetId?: unknown } | null)?.assetId === assetId) return true;
    }
    return false;
  };
}
