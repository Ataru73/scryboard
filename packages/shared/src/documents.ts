/** Ruolo di un utente connesso a una stanza. */
export type Role = "gm" | "player";

/**
 * Ogni stanza ha due documenti Yjs condivisi: quello pubblico, che ricevono tutti, e quello del
 * GM, che contiene gli oggetti nascosti e a cui il server permette l'accesso solo al GM. Ci sono
 * poi le caselle di posta dei messaggi privati (`mail`), una per giocatore più quella del GM.
 */
export type DocumentScope = "public" | "gm" | "mail";

/** Casella di posta del GM: riceve una copia di tutti i messaggi. */
export const GM_MAILBOX = "gm";
/** Id dei profili: esadecimali generati dal browser. */
export const PROFILE_ID_PATTERN = /^[a-f0-9]{8,64}$/;

const DOCUMENT_NAME = /^room:([A-Za-z0-9_-]+):(public|gm|mail:(gm|[a-f0-9]{8,64}))$/;

export function roomDocumentName(roomId: string, scope: Exclude<DocumentScope, "mail">): string {
  return `room:${roomId}:${scope}`;
}

/** Documento della casella di posta: `mailbox` è "gm" o l'id del profilo di un giocatore. */
export function mailDocumentName(roomId: string, mailbox: string): string {
  return `room:${roomId}:mail:${mailbox}`;
}

export function parseRoomDocumentName(
  name: string,
): { roomId: string; scope: DocumentScope; mailbox?: string } | null {
  const match = DOCUMENT_NAME.exec(name);
  if (!match) return null;
  const roomId = match[1] as string;
  if (match[3]) return { roomId, scope: "mail", mailbox: match[3] };
  return { roomId, scope: match[2] as DocumentScope };
}
