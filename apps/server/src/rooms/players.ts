import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { players } from "../db/schema";
import { hashToken, tokenMatchesHash } from "./tokens";

/** Identità dei giocatori di una stanza: legate al segreto con cui si presentano la prima volta. */
export class PlayerService {
  constructor(private readonly db: Db) {}

  private find(roomId: string, profileId: string) {
    return this.db
      .select()
      .from(players)
      .where(and(eq(players.roomId, roomId), eq(players.profileId, profileId)))
      .get();
  }

  /**
   * Verifica il segreto del giocatore; alla prima volta lo registra (chi arriva per primo con
   * quell'id se lo tiene). Restituisce false se l'id è già di qualcun altro.
   */
  authenticate(roomId: string, profileId: string, secret: string, name = ""): boolean {
    const row = this.find(roomId, profileId);
    if (row) return tokenMatchesHash(secret, row.secretHash);
    this.db
      .insert(players)
      .values({
        roomId,
        profileId,
        secretHash: hashToken(secret),
        name,
        createdAt: new Date().toISOString(),
      })
      .onConflictDoNothing()
      .run();
    // Due registrazioni simultanee: vale quella arrivata per prima.
    const saved = this.find(roomId, profileId);
    return saved !== undefined && tokenMatchesHash(secret, saved.secretHash);
  }

  exists(roomId: string, profileId: string): boolean {
    return this.find(roomId, profileId) !== undefined;
  }

  name(roomId: string, profileId: string): string {
    return this.find(roomId, profileId)?.name ?? "";
  }

  rename(roomId: string, profileId: string, name: string) {
    this.db
      .update(players)
      .set({ name })
      .where(and(eq(players.roomId, roomId), eq(players.profileId, profileId)))
      .run();
  }
}
