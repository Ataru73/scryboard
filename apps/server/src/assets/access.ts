import { MAX_LISTED_ASSETS, type RoomAsset } from "@scryboard/shared";
import { and, desc, eq } from "drizzle-orm";
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

  /** Immagini della stanza, le più recenti per prime: il GM le vede tutte, gli altri le pubbliche. */
  list(roomId: string, isGm: boolean): RoomAsset[] {
    return this.db
      .select({ assetId: assets.assetId, createdAt: assets.createdAt, public: assets.public })
      .from(assets)
      .where(
        isGm ? eq(assets.roomId, roomId) : and(eq(assets.roomId, roomId), eq(assets.public, true)),
      )
      .orderBy(desc(assets.createdAt))
      .limit(MAX_LISTED_ASSETS)
      .all();
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
