import type { Role } from "./documents";

/** Stato di presenza condiviso tramite l'awareness di Yjs (non persistito). */
export interface PresenceUser {
  /** Id del profilo: serve al GM per assegnare i token ai giocatori. */
  id?: string;
  name: string;
  color: string;
  role: Role;
  /**
   * Schermo condiviso al tavolo (TV, proiettore): entra come un giocatore ma non è un giocatore,
   * quindi non riceve messaggi né token e non conta per la visione del gruppo.
   */
  projector?: boolean;
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
