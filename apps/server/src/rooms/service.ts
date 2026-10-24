import type { CreateRoomResponse, RoomInfo } from "@scryboard/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { rooms } from "../db/schema";
import { generateGmToken, generateRoomId, hashToken, tokenMatchesHash } from "./tokens";

export class RoomService {
  constructor(private readonly db: Db) {}

  create(name: string): CreateRoomResponse {
    const gmToken = generateGmToken();
    const row = {
      id: generateRoomId(),
      name,
      gmTokenHash: hashToken(gmToken),
      createdAt: new Date().toISOString(),
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
