import { rm } from "node:fs/promises";
import { join } from "node:path";
import { eq, like } from "drizzle-orm";
import type { Db } from "../db/client";
import { assets, documents, players, rooms } from "../db/schema";
import type { RoomService } from "./service";

/**
 * Elimina definitivamente le stanze inattive da più di `days` giorni: documenti, immagini e
 * metadati. Da lanciare a mano o da un cron, non c'è modo di recuperarle.
 */
export async function pruneInactiveRooms(
  db: Db,
  roomService: RoomService,
  assetsDir: string,
  days: number,
  now = new Date(),
): Promise<string[]> {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const ids = roomService.inactiveSince(cutoff);
  for (const id of ids) {
    db.transaction((tx) => {
      // Tutti i documenti della stanza: pubblico, del GM e caselle di posta.
      tx.delete(documents)
        .where(like(documents.name, `room:${id}:%`))
        .run();
      tx.delete(players).where(eq(players.roomId, id)).run();
      tx.delete(assets).where(eq(assets.roomId, id)).run();
      tx.delete(rooms).where(eq(rooms.id, id)).run();
    });
    await rm(join(assetsDir, id), { recursive: true, force: true });
  }
  return ids;
}
