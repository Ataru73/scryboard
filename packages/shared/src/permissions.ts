import type { BoardItem } from "./board";
import type { Role } from "./documents";

/**
 * Chi può selezionare un oggetto: il GM sempre (anche bloccato, per sbloccarlo); i giocatori
 * solo fuori dal livello mappa e se non è bloccato.
 */
export function canSelect(item: BoardItem | undefined, role: Role): item is BoardItem {
  if (!item) return false;
  return role === "gm" || (item.layer !== "map" && !item.locked);
}

/** Chi può spostare, trasformare o cancellare: un oggetto bloccato non si tocca finché è bloccato. */
export function canModify(item: BoardItem | undefined, role: Role): item is BoardItem {
  return canSelect(item, role) && !item.locked;
}
