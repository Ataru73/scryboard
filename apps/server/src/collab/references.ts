import type { Hocuspocus } from "@hocuspocus/server";
import { ITEMS_MAP, roomDocumentName } from "@scryboard/shared";
import { eq } from "drizzle-orm";
import * as Y from "yjs";
import type { PublicReferenceCheck } from "../assets/access";
import type { Db } from "../db/client";
import { documents } from "../db/schema";

/** Cerca l'asset tra gli oggetti del documento pubblico: in memoria se aperto, altrimenti su disco. */
export function publicReferenceCheck(collab: Hocuspocus, db: Db): PublicReferenceCheck {
  return async (roomId, assetId) => {
    const name = roomDocumentName(roomId, "public");
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
