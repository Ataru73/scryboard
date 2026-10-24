import { z } from "zod";
import { GM_MAILBOX, PROFILE_ID_PATTERN } from "./documents";

/** Nome dell'array Yjs con i messaggi in ogni casella di posta. */
export const MESSAGES_ARRAY = "messages";
export const MAX_MESSAGE_LENGTH = 2000;

const participant = z.union([z.literal(GM_MAILBOX), z.string().regex(PROFILE_ID_PATTERN)]);

/**
 * Messaggio privato. Lo scrive solo il server, in tre caselle al massimo: quella del mittente,
 * quella del destinatario e quella del GM, che legge tutto.
 */
export const messageSchema = z.object({
  id: z.string().min(1).max(64),
  from: participant,
  fromName: z.string().max(40),
  to: participant,
  toName: z.string().max(40),
  text: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  at: z.iso.datetime(),
});
export type Message = z.infer<typeof messageSchema>;

export const sendMessageRequestSchema = z.object({
  to: participant,
  text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  /** Nome con cui firma chi scrive (il profilo può cambiare nome). */
  fromName: z.string().trim().min(1).max(32),
});
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

/**
 * Credenziali di un giocatore: l'id del profilo è visibile a tutti (presenza), il segreto resta nel
 * suo browser. Il server lega i due alla prima connessione alla casella di posta.
 */
export function playerCredentials(profileId: string, secret: string): string {
  return `${profileId}:${secret}`;
}

export function parsePlayerCredentials(
  value: string,
): { profileId: string; secret: string } | null {
  const match = /^([a-f0-9]{8,64}):([A-Za-z0-9_-]{16,128})$/.exec(value);
  return match ? { profileId: match[1] as string, secret: match[2] as string } : null;
}
