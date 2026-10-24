import {
  createRoomRequestSchema,
  MAX_ASSET_BYTES,
  ROOM_ID_PATTERN,
  type UploadAssetResponse,
} from "@scryboard/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AssetAccess } from "../assets/access";
import { type AssetStore, UnsupportedAssetError } from "../assets/store";
import type { RoomService } from "../rooms/service";

export function createApi(rooms: RoomService, assets: AssetStore, access: AssetAccess): Hono {
  const api = new Hono();

  const findRoom = (id: string) => (ROOM_ID_PATTERN.test(id) ? rooms.get(id) : null);
  // Il GM si identifica con il suo token nell'header Authorization.
  const isGmRequest = (roomId: string, header: string | undefined) => {
    const token = header?.match(/^Bearer (.+)$/)?.[1];
    return token !== undefined && rooms.isGmToken(roomId, token);
  };

  api.get("/health", (c) => c.json({ ok: true }));

  api.post("/rooms", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createRoomRequestSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "Nome della stanza non valido" }, 400);
    return c.json(rooms.create(parsed.data.name), 201);
  });

  api.get("/rooms/:id", (c) => {
    const room = findRoom(c.req.param("id"));
    if (!room) return c.json({ error: "Stanza non trovata" }, 404);
    return c.json(room);
  });

  // Verifica un token GM senza esporre altro: usato dal client per mostrare l'interfaccia GM.
  api.post("/rooms/:id/gm-check", async (c) => {
    const body = await c.req.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token : "";
    return c.json({ valid: rooms.isGmToken(c.req.param("id"), token) });
  });

  // Il corpo della richiesta è il file stesso, non multipart.
  api.post(
    "/rooms/:id/assets",
    bodyLimit({
      maxSize: MAX_ASSET_BYTES,
      onError: (c) => c.json({ error: "Immagine troppo grande (max 20 MB)" }, 413),
    }),
    async (c) => {
      const room = findRoom(c.req.param("id"));
      if (!room) return c.json({ error: "Stanza non trovata" }, 404);
      const data = new Uint8Array(await c.req.arrayBuffer());
      if (data.length === 0) return c.json({ error: "File vuoto" }, 400);
      try {
        const assetId = await assets.put(room.id, data);
        access.recordUpload(room.id, assetId, isGmRequest(room.id, c.req.header("authorization")));
        return c.json({ assetId } satisfies UploadAssetResponse, 201);
      } catch (error) {
        if (error instanceof UnsupportedAssetError) {
          return c.json({ error: "Formato non supportato: usa PNG, JPEG, WebP o GIF" }, 415);
        }
        throw error;
      }
    },
  );

  api.get("/rooms/:id/assets/:assetId", async (c) => {
    const roomId = c.req.param("id");
    const assetId = c.req.param("assetId");
    const allowed =
      ROOM_ID_PATTERN.test(roomId) &&
      (await access.canRead(roomId, assetId, isGmRequest(roomId, c.req.header("authorization"))));
    // Stessa risposta per "non esiste" e "non puoi vederla": non si rivela nulla.
    const asset = allowed ? await assets.get(roomId, assetId) : null;
    if (!asset) return c.json({ error: "Immagine non trovata" }, 404);
    return c.body(asset.body, 200, {
      "content-type": asset.contentType,
      "content-length": String(asset.size),
      // L'id è l'hash del contenuto: il file non cambia mai.
      // Mai in cache condivise: alcune immagini sono riservate al GM.
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    });
  });

  return api;
}
