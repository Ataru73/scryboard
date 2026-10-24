import type { CreateRoomResponse, RoomInfo } from "@scryboard/shared";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { rooms } from "../db/schema";
import { generateGmToken, generateRoomId, hashToken, tokenMatchesHash } from "./tokens";

/** Ogni quanto aggiornare al massimo l'ultima attività di una stanza. */
const TOUCH_INTERVAL_MS = 60_000;

export class RoomService {
  private readonly lastTouch = new Map<string, number>();

  constructor(private readonly db: Db) {}

  /** Segna la stanza come attiva (al massimo una scrittura al minuto per stanza). */
  touch(id: string, now = Date.now()) {
    if (now - (this.lastTouch.get(id) ?? 0) < TOUCH_INTERVAL_MS) return;
    this.lastTouch.set(id, now);
    this.db
      .update(rooms)
      .set({ lastActiveAt: new Date(now).toISOString() })
      .where(eq(rooms.id, id))
      .run();
  }

  /** Stanze senza attività dalla data indicata (per le più vecchie vale la creazione). */
  inactiveSince(cutoff: Date): string[] {
    return this.db
      .select({ id: rooms.id })
      .from(rooms)
      .where(sql`coalesce(${rooms.lastActiveAt}, ${rooms.createdAt}) < ${cutoff.toISOString()}`)
      .all()
      .map((r) => r.id);
  }

  create(name: string): CreateRoomResponse {
    const gmToken = generateGmToken();
    const row = {
      id: generateRoomId(),
      name,
      gmTokenHash: hashToken(gmToken),
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };
    this.db.insert(rooms).values(row).run();
    return { id: row.id, name: row.name, createdAt: row.createdAt, gmToken };
  }

  get(id: string): RoomInfo | null {
    const row = this.db.select().from(rooms).where(eq(rooms.id, id)).get();
    if (!row) return null;
    return { id: row.id, name: row.name, createdAt: row.createdAt };
  }

  isGmToken(roomId: string, token: string): boolean {
    const row = this.db
      .select({ gmTokenHash: rooms.gmTokenHash })
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .get();
    return row !== undefined && tokenMatchesHash(token, row.gmTokenHash);
  }
}
