import {
  createRoomRequestSchema,
  MAX_ASSET_BYTES,
  parsePlayerCredentials,
  ROOM_ID_PATTERN,
  sendMessageRequestSchema,
  type UploadAssetResponse,
} from "@scryboard/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AssetAccess } from "../assets/access";
import { type AssetStore, UnsupportedAssetError } from "../assets/store";
import { MessageError, type MessageService, type Sender } from "../collab/messages";
import type { PlayerService } from "../rooms/players";
import type { RoomService } from "../rooms/service";
import { rateLimit } from "./rateLimit";

export interface ApiOptions {
  limits: { rooms: number; uploads: number; messages: number };
  trustProxy: boolean;
}

const TEN_MINUTES = 10 * 60 * 1000;

export function createApi(
  rooms: RoomService,
  assets: AssetStore,
  access: AssetAccess,
  options: ApiOptions,
  messaging: { messages: MessageService; players: PlayerService },
): Hono {
  const api = new Hono();
  const limitRooms = rateLimit({
    max: options.limits.rooms,
    windowMs: TEN_MINUTES,
    trustProxy: options.trustProxy,
    message: "Troppe stanze create in poco tempo: riprova tra qualche minuto.",
  });
  const limitMessages = rateLimit({
    max: options.limits.messages,
    windowMs: TEN_MINUTES,
    trustProxy: options.trustProxy,
    message: "Troppi messaggi in poco tempo: riprova tra qualche minuto.",
  });
  const limitUploads = rateLimit({
    max: options.limits.uploads,
    windowMs: TEN_MINUTES,
    trustProxy: options.trustProxy,
    message: "Troppi caricamenti in poco tempo: riprova tra qualche minuto.",
  });

  const findRoom = (id: string) => (ROOM_ID_PATTERN.test(id) ? rooms.get(id) : null);
  // Il GM si identifica con il suo token nell'header Authorization.
  const isGmRequest = (roomId: string, header: string | undefined) => {
    const token = header?.match(/^Bearer (.+)$/)?.[1];
    return token !== undefined && rooms.isGmToken(roomId, token);
  };

  api.get("/health", (c) => c.json({ ok: true }));

  api.post("/rooms", limitRooms, async (c) => {
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
    limitUploads,
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

  // Messaggi privati: il GM si identifica con il suo token, i giocatori con id del profilo e
  // segreto ("Player <id>:<segreto>").
  api.post("/rooms/:id/messages", limitMessages, async (c) => {
    const room = findRoom(c.req.param("id"));
    if (!room) return c.json({ error: "Stanza non trovata" }, 404);
    const parsed = sendMessageRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Messaggio non valido" }, 400);
    const header = c.req.header("authorization") ?? "";
    let sender: Sender | null = null;
    if (isGmRequest(room.id, header)) {
      sender = { kind: "gm", name: parsed.data.fromName };
    } else {
      const credentials = parsePlayerCredentials(header.match(/^Player (.+)$/)?.[1] ?? "");
      if (
        credentials &&
        messaging.players.authenticate(
          room.id,
          credentials.profileId,
          credentials.secret,
          parsed.data.fromName,
        )
      ) {
        sender = { kind: "player", profileId: credentials.profileId, name: parsed.data.fromName };
      }
    }
    if (!sender) return c.json({ error: "Non autorizzato" }, 401);
    try {
      const message = await messaging.messages.send(
        room.id,
        sender,
        parsed.data.to,
        parsed.data.text,
      );
      return c.json({ id: message.id }, 201);
    } catch (error) {
      if (error instanceof MessageError) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

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
