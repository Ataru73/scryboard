import { type BoardItem, GM_LAYERS } from "./board";
import type { Role } from "./documents";

/**
 * Chi può selezionare un oggetto: il GM sempre (anche bloccato, per sbloccarlo); i giocatori
 * solo fuori dai livelli del GM (mappe e percorsi) e se non è bloccato.
 */
export function canSelect(item: BoardItem | undefined, role: Role): item is BoardItem {
  if (!item) return false;
  return role === "gm" || (!GM_LAYERS.includes(item.layer) && !item.locked);
}

/** Chi può spostare, trasformare o cancellare: un oggetto bloccato non si tocca finché è bloccato. */
export function canModify(item: BoardItem | undefined, role: Role): item is BoardItem {
  return canSelect(item, role) && !item.locked;
}
