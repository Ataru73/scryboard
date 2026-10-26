import type { Hocuspocus } from "@hocuspocus/server";
import {
  ACTIVE_SCENE_KEY,
  META_MAP,
  metaDocumentName,
  ROLLS_MAP,
  roomDocumentName,
  type Scene,
  SETTINGS_MAP,
} from "@scryboard/shared";
import * as Y from "yjs";
import type { SceneService } from "../rooms/scenes";
import type { ConnectionContext } from "./hocuspocus";

/** Codice di chiusura per chi è in una scena che non è più quella dei giocatori. */
const SCENE_CLOSED = 4403;

/**
 * Operazioni sulle scene che toccano i documenti Yjs: spostare i giocatori (e chiudere chi
 * resta sulla scena che hanno lasciato) e duplicare una scena.
 */
export class SceneCollab {
  constructor(
    private readonly collab: Hocuspocus<ConnectionContext>,
    private readonly scenes: SceneService,
  ) {}

  /** Scrive nel documento `meta` la scena attiva: i client dei giocatori la seguono. */
  async publishActive(roomId: string): Promise<void> {
    const active = this.scenes.activeId(roomId);
    const connection = await this.collab.openDirectConnection(metaDocumentName(roomId), {
      roomId,
      role: "gm",
    });
    try {
      await connection.transact((doc) => {
        const meta = doc.getMap<string>(META_MAP);
        if (meta.get(ACTIVE_SCENE_KEY) !== active) meta.set(ACTIVE_SCENE_KEY, active);
      });
    } finally {
      await connection.disconnect();
    }
  }

  /** Porta i giocatori nella scena: chi era ancora collegata a quella vecchia viene scollegato. */
  async activate(roomId: string, sceneId: string): Promise<void> {
    const previous = this.scenes.activate(roomId, sceneId);
    await this.publishActive(roomId);
    if (previous === sceneId) return;
    const document = this.collab.documents.get(roomDocumentName(roomId, "public", previous));
    for (const connection of document?.getConnections() ?? []) {
      if ((connection.context as ConnectionContext | undefined)?.role === "player") {
        connection.close({ code: SCENE_CLOSED, reason: "La scena è cambiata" });
      }
    }
  }

  /** Copia gli oggetti, le impostazioni e le zone nascoste di una scena in una nuova. */
  async duplicate(roomId: string, sourceId: string, name: string): Promise<Scene> {
    const scene = this.scenes.create(roomId, name);
    for (const scope of ["public", "gm"] as const) {
      const source = await this.collab.openDirectConnection(
        roomDocumentName(roomId, scope, sourceId),
        { roomId, role: "gm" },
      );
      let state: Uint8Array = new Uint8Array();
      try {
        await source.transact((doc) => {
          state = Y.encodeStateAsUpdate(doc);
        });
      } finally {
        await source.disconnect();
      }
      const target = await this.collab.openDirectConnection(
        roomDocumentName(roomId, scope, scene.id),
        { roomId, role: "gm" },
      );
      try {
        await target.transact((doc) => {
          Y.applyUpdate(doc, state);
          if (scope === "public") {
            // Il registro dei tiri, il richiamo e l'immagine mostrata appartengono alla scena
            // originale.
            doc.getMap(ROLLS_MAP).clear();
            doc.getMap(SETTINGS_MAP).delete("summon");
            doc.getMap(SETTINGS_MAP).delete("handout");
          }
        });
      } finally {
        await target.disconnect();
      }
    }
    return scene;
  }
}
