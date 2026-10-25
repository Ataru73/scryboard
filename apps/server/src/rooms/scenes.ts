import { randomBytes } from "node:crypto";
import { DEFAULT_SCENE, type Scene, type ScenesResponse } from "@scryboard/shared";
import { and, asc, eq, max } from "drizzle-orm";
import type { Db } from "../db/client";
import { documents, rooms, scenes } from "../db/schema";

export class SceneError extends Error {}

/** Elenco e stato delle scene di una stanza (i documenti li gestisce `SceneCollab`). */
export class SceneService {
  constructor(private readonly db: Db) {}

  list(roomId: string): ScenesResponse {
    const rows = this.db
      .select({ id: scenes.id, name: scenes.name })
      .from(scenes)
      .where(eq(scenes.roomId, roomId))
      .orderBy(asc(scenes.position), asc(scenes.createdAt))
      .all();
    return { active: this.activeId(roomId), scenes: rows };
  }

  activeId(roomId: string): string {
    const row = this.db
      .select({ active: rooms.activeScene })
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .get();
    return row?.active ?? DEFAULT_SCENE;
  }

  has(roomId: string, sceneId: string): boolean {
    return (
      this.db
        .select({ id: scenes.id })
        .from(scenes)
        .where(and(eq(scenes.roomId, roomId), eq(scenes.id, sceneId)))
        .get() !== undefined
    );
  }

  create(roomId: string, name: string): Scene {
    const last = this.db
      .select({ position: max(scenes.position) })
      .from(scenes)
      .where(eq(scenes.roomId, roomId))
      .get();
    const scene = { id: randomBytes(9).toString("hex"), name };
    this.db
      .insert(scenes)
      .values({
        roomId,
        ...scene,
        position: (last?.position ?? -1) + 1,
        createdAt: new Date().toISOString(),
      })
      .run();
    return scene;
  }

  rename(roomId: string, sceneId: string, name: string) {
    if (!this.has(roomId, sceneId)) throw new SceneError("Scena non trovata.");
    this.db
      .update(scenes)
      .set({ name })
      .where(and(eq(scenes.roomId, roomId), eq(scenes.id, sceneId)))
      .run();
  }

  /** Cancella la scena e i suoi documenti: non si può togliere quella attiva né l'ultima. */
  remove(roomId: string, sceneId: string) {
    const all = this.list(roomId);
    if (!all.scenes.some((s) => s.id === sceneId)) throw new SceneError("Scena non trovata.");
    if (all.active === sceneId) {
      throw new SceneError("Non puoi eliminare la scena dove si trovano i giocatori.");
    }
    if (all.scenes.length <= 1) throw new SceneError("Serve almeno una scena.");
    const names =
      sceneId === DEFAULT_SCENE
        ? [`room:${roomId}:public`, `room:${roomId}:gm`]
        : [`room:${roomId}:s:${sceneId}:public`, `room:${roomId}:s:${sceneId}:gm`];
    this.db.transaction((tx) => {
      for (const name of names) tx.delete(documents).where(eq(documents.name, name)).run();
      tx.delete(scenes)
        .where(and(eq(scenes.roomId, roomId), eq(scenes.id, sceneId)))
        .run();
    });
    return names;
  }

  /** Sposta i giocatori nella scena; restituisce quella che hanno lasciato. */
  activate(roomId: string, sceneId: string): string {
    if (!this.has(roomId, sceneId)) throw new SceneError("Scena non trovata.");
    const previous = this.activeId(roomId);
    this.db.update(rooms).set({ activeScene: sceneId }).where(eq(rooms.id, roomId)).run();
    return previous;
  }
}
