import type { Role } from "./documents";

/** Stato di presenza condiviso tramite l'awareness di Yjs (non persistito). */
export interface PresenceUser {
  /** Id del profilo: serve al GM per assegnare i token ai giocatori. */
  id?: string;
  name: string;
  color: string;
  role: Role;
}

export const PLAYER_COLORS = [
  "#e5484d",
  "#f76b15",
  "#ffc53d",
  "#46a758",
  "#12a594",
  "#0090ff",
  "#8e4ec6",
  "#d6409f",
] as const;
