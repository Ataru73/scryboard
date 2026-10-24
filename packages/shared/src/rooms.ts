import { z } from "zod";

export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{10,32}$/;

export const createRoomRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
});
export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;

export const roomInfoSchema = z.object({
  id: z.string().regex(ROOM_ID_PATTERN),
  name: z.string(),
  createdAt: z.iso.datetime(),
});
export type RoomInfo = z.infer<typeof roomInfoSchema>;

/** Il token del GM viene restituito una sola volta, alla creazione. */
export const createRoomResponseSchema = roomInfoSchema.extend({
  gmToken: z.string().min(32),
});
export type CreateRoomResponse = z.infer<typeof createRoomResponseSchema>;

export interface ApiError {
  error: string;
}
