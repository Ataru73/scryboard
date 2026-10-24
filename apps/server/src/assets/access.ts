import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { assets } from "../db/schema";

/** Dice se un asset è usato da un oggetto del documento pubblico della stanza. */
export type PublicReferenceCheck = (roomId: string, assetId: string) => Promise<boolean>;

/**
 * Chi può scaricare un'immagine: il GM sempre; i giocatori solo se è pubblica, cioè caricata da
 * un giocatore oppure usata da un oggetto visibile a tutti. Così le immagini degli oggetti
 * nascosti non si possono scaricare indovinandone l'URL.
 */
export class AssetAccess {
  constructor(
    private readonly db: Db,
    private readonly isReferencedPublicly: PublicReferenceCheck,
  ) {}

  recordUpload(roomId: string, assetId: string, byGm: boolean) {
    const row = { roomId, assetId, public: !byGm, createdAt: new Date().toISOString() };
    const insert = this.db.insert(assets).values(row);
    // Un'immagine già pubblica resta tale anche se il GM la ricarica.
    if (byGm) insert.onConflictDoNothing().run();
    else
      insert
        .onConflictDoUpdate({ target: [assets.roomId, assets.assetId], set: { public: true } })
        .run();
  }

  async canRead(roomId: string, assetId: string, isGm: boolean): Promise<boolean> {
    if (isGm) return true;
    const where = and(eq(assets.roomId, roomId), eq(assets.assetId, assetId));
    const row = this.db.select({ public: assets.public }).from(assets).where(where).get();
    if (!row || row.public) return true;
    if (!(await this.isReferencedPublicly(roomId, assetId))) return false;
    this.db.update(assets).set({ public: true }).where(where).run();
    return true;
  }
}
