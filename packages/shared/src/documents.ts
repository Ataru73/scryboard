/** Ruolo di un utente connesso a una stanza. */
export type Role = "gm" | "player";

/**
 * Una stanza ha una o più scene. Ogni scena ha due documenti Yjs: quello pubblico, che ricevono
 * tutti i giocatori presenti nella scena attiva, e quello del GM, che contiene gli oggetti
 * nascosti e a cui il server permette l'accesso solo al GM. Ci sono poi un documento `meta` di
 * sola lettura con la scena attiva e le caselle di posta dei messaggi privati (`mail`), una per
 * giocatore più quella del GM, che valgono per tutta la stanza.
 */
export type DocumentScope = "public" | "gm" | "mail" | "meta";

/**
 * La scena che esisteva prima delle scene multiple tiene i nomi di documento di allora
 * (`room:<id>:public`), così le stanze esistenti non vanno migrate.
 */
export const DEFAULT_SCENE = "main";
export const SCENE_ID_PATTERN = /^[a-z0-9]{8,24}$/;

/** Casella di posta del GM: riceve una copia di tutti i messaggi. */
export const GM_MAILBOX = "gm";
/** Id dei profili: esadecimali generati dal browser. */
export const PROFILE_ID_PATTERN = /^[a-f0-9]{8,64}$/;

const DOCUMENT_NAME =
  /^room:([A-Za-z0-9_-]+):(?:(public|gm|meta)|s:([a-z0-9]{8,24}):(public|gm)|mail:(gm|[a-f0-9]{8,64}))$/;

/** Documento di una scena: `scope` è "public" o "gm". */
export function roomDocumentName(
  roomId: string,
  scope: "public" | "gm",
  sceneId: string = DEFAULT_SCENE,
): string {
  return sceneId === DEFAULT_SCENE
    ? `room:${roomId}:${scope}`
    : `room:${roomId}:s:${sceneId}:${scope}`;
}

/** Documento con la scena attiva, in sola lettura per tutti. */
export function metaDocumentName(roomId: string): string {
  return `room:${roomId}:meta`;
}

/** Documento della casella di posta: `mailbox` è "gm" o l'id del profilo di un giocatore. */
export function mailDocumentName(roomId: string, mailbox: string): string {
  return `room:${roomId}:mail:${mailbox}`;
}

export function parseRoomDocumentName(
  name: string,
): { roomId: string; scope: DocumentScope; sceneId: string; mailbox?: string } | null {
  const match = DOCUMENT_NAME.exec(name);
  if (!match) return null;
  const roomId = match[1] as string;
  if (match[5]) return { roomId, scope: "mail", sceneId: DEFAULT_SCENE, mailbox: match[5] };
  if (match[3]) return { roomId, scope: match[4] as DocumentScope, sceneId: match[3] };
  return { roomId, scope: match[2] as DocumentScope, sceneId: DEFAULT_SCENE };
}
