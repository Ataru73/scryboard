/** Ruolo di un utente connesso a una stanza. */
export type Role = "gm" | "player";

/**
 * Ogni stanza ha due documenti Yjs: quello pubblico, che ricevono tutti, e quello del GM,
 * che contiene gli oggetti nascosti e a cui il server permette l'accesso solo al GM.
 */
export type DocumentScope = "public" | "gm";

const DOCUMENT_NAME = /^room:([A-Za-z0-9_-]+):(public|gm)$/;

export function roomDocumentName(roomId: string, scope: DocumentScope): string {
  return `room:${roomId}:${scope}`;
}

export function parseRoomDocumentName(
  name: string,
): { roomId: string; scope: DocumentScope } | null {
  const match = DOCUMENT_NAME.exec(name);
  if (!match) return null;
  return { roomId: match[1] as string, scope: match[2] as DocumentScope };
}
