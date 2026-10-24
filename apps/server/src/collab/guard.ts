import { isTransactionOrigin } from "@hocuspocus/server";
import {
  type BoardItem,
  boardItemSchema,
  canModify,
  canPlayerToggleDoor,
  FOG_MAP,
  type FogOp,
  fogOpSchema,
  ITEMS_MAP,
  isDoorFogged,
  type Role,
  SETTINGS_MAP,
  sortFogOps,
  TERRAIN_MAP,
  WALLS_MAP,
  type Wall,
  wallSchema,
} from "@scryboard/shared";
import type * as Y from "yjs";

/** Origine delle transazioni con cui il server annulla le modifiche non autorizzate. */
export const GUARD_ORIGIN = { source: "local" as const, guard: true };

function roleOf(origin: unknown): Role | null {
  if (!isTransactionOrigin(origin) || origin.source !== "connection") return null;
  const context = origin.connection.context as { role?: Role } | undefined;
  return context?.role ?? null;
}

function parseItem(value: unknown, key: string): BoardItem | null {
  const parsed = boardItemSchema.safeParse(value);
  return parsed.success && parsed.data.id === key ? parsed.data : null;
}

function parseWall(value: unknown, key: string): Wall | null {
  const parsed = wallSchema.safeParse(value);
  return parsed.success && parsed.data.id === key ? parsed.data : null;
}

type Action = "add" | "update" | "delete";

/** Un giocatore può creare, modificare o cancellare solo oggetti che potrebbe toccare dall'interfaccia. */
export function isAllowedPlayerItemChange(
  action: Action,
  key: string,
  oldValue: unknown,
  newValue: unknown,
) {
  const before = action === "add" ? null : parseItem(oldValue, key);
  const after = action === "delete" ? null : parseItem(newValue, key);
  // Un valore precedente illeggibile (dati corrotti) si può sostituire o rimuovere.
  if (action !== "add" && before && !canModify(before, "player")) return false;
  if (action === "delete") return true;
  if (!after || !canModify(after, "player")) return false;
  return !before || before.kind === after.kind;
}

/**
 * Un giocatore può soltanto aprire o chiudere una porta esistente senza alterarla, e non se è
 * coperta dalla nebbia (`fog` ordinata per seq): per lui quella porta non si vede.
 */
export function isAllowedPlayerWallChange(
  action: Action,
  key: string,
  oldValue: unknown,
  newValue: unknown,
  fog: FogOp[] = [],
) {
  if (action !== "update") return false;
  const before = parseWall(oldValue, key);
  const after = parseWall(newValue, key);
  if (!before || !after || !canPlayerToggleDoor(before) || !canPlayerToggleDoor(after)) {
    return false;
  }
  if (isDoorFogged(before, fog)) return false;
  if (
    before.id !== after.id ||
    before.kind !== after.kind ||
    before.points.length !== after.points.length ||
    before.points.some((coordinate, index) => coordinate !== after.points[index])
  ) {
    return false;
  }
  return (
    (before.door === "open" && after.door === "closed") ||
    (before.door === "closed" && after.door === "open")
  );
}

/**
 * Controlla le modifiche dei giocatori al documento pubblico. Gli aggiornamenti Yjs non si
 * possono rifiutare senza chiudere la connessione (e il client li rimanderebbe a ogni
 * riconnessione), quindi il server li applica e subito dopo ripristina i valori precedenti con
 * una propria transazione: tutti i client convergono allo stato corretto.
 */
export function guardPublicDocument(doc: Y.Doc): void {
  const reverts: Array<() => void> = [];

  const watch = (
    map: Y.Map<unknown>,
    allowed: (action: Action, key: string, oldValue: unknown) => boolean,
  ) => {
    map.observe((event, transaction) => {
      if (roleOf(transaction.origin) !== "player") return;
      event.changes.keys.forEach((change, key) => {
        if (allowed(change.action, key, change.oldValue)) return;
        const { action, oldValue } = change;
        reverts.push(() => {
          if (action === "add") map.delete(key);
          else map.set(key, oldValue);
        });
      });
    });
  };

  const items = doc.getMap<unknown>(ITEMS_MAP);
  watch(items, (action, key, oldValue) =>
    isAllowedPlayerItemChange(action, key, oldValue, items.get(key)),
  );
  const walls = doc.getMap<unknown>(WALLS_MAP);
  const fogMap = doc.getMap<unknown>(FOG_MAP);
  const currentFog = () =>
    sortFogOps(
      [...fogMap.values()].flatMap((value) => {
        const parsed = fogOpSchema.safeParse(value);
        return parsed.success ? [parsed.data] : [];
      }),
    );
  watch(walls, (action, key, oldValue) =>
    isAllowedPlayerWallChange(action, key, oldValue, walls.get(key), currentFog()),
  );
  // Impostazioni della board, nebbia e terreno sono riservati al GM.
  watch(doc.getMap(SETTINGS_MAP), () => false);
  watch(fogMap, () => false);
  watch(doc.getMap(TERRAIN_MAP), () => false);

  doc.on("afterTransaction", () => {
    if (reverts.length === 0) return;
    const pending = reverts.splice(0);
    // Fuori dalla transazione corrente, che Yjs sta ancora chiudendo.
    queueMicrotask(() =>
      doc.transact(() => {
        for (const revert of pending) revert();
      }, GUARD_ORIGIN),
    );
  });
}
