import { createRoomRequestSchema, ROOM_ID_PATTERN } from "@scryboard/shared";
import { Hono } from "hono";
import type { RoomService } from "../rooms/service";

export function createApi(rooms: RoomService): Hono {
  const api = new Hono();

  api.get("/health", (c) => c.json({ ok: true }));

  api.post("/rooms", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createRoomRequestSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "Nome della stanza non valido" }, 400);
    return c.json(rooms.create(parsed.data.name), 201);
  });

  api.get("/rooms/:id", (c) => {
    const id = c.req.param("id");
    const room = ROOM_ID_PATTERN.test(id) ? rooms.get(id) : null;
    if (!room) return c.json({ error: "Stanza non trovata" }, 404);
    return c.json(room);
  });

  // Verifica un token GM senza esporre altro: usato dal client per mostrare l'interfaccia GM.
  api.post("/rooms/:id/gm-check", async (c) => {
    const body = await c.req.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token : "";
    return c.json({ valid: rooms.isGmToken(c.req.param("id"), token) });
  });

  return api;
}
