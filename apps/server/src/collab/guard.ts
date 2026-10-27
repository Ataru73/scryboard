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
  isVideoAsset,
  ROLLS_MAP,
  type Role,
  SETTINGS_MAP,
  sortFogOps,
  TERRAIN_MAP,
  TOKEN_IDENTITY_KEYS,
  WALLS_MAP,
  type Wall,
  wallSchema,
} from "@scryboard/shared";
import type * as Y from "yjs";

/** Origine delle transazioni con cui il server annulla le modifiche non autorizzate. */
export const GUARD_ORIGIN = { source: "local" as const, guard: true };

const ALLOWED_PUBLIC_MAPS = new Set([
  ITEMS_MAP,
  WALLS_MAP,
  ROLLS_MAP,
  SETTINGS_MAP,
  FOG_MAP,
  TERRAIN_MAP,
]);

type TargetState = { action: "delete" } | { action: "set"; value: unknown };

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

/** Campi di visione di un token, normalizzati (assenti = valori predefiniti) per il confronto. */
function visionFields(token: Extract<BoardItem, { kind: "token" }> | null): string {
  return JSON.stringify({
    vision: token?.vision ?? null,
    light: token?.light ?? null,
    owners: token?.owners?.length ? token.owners : null,
  });
}

/** Chi sta nell'ordine dei turni lo decide il GM: i giocatori possono solo cambiare il valore. */
function sameInitiativeMembership(
  before: Extract<BoardItem, { kind: "token" }> | null,
  after: Extract<BoardItem, { kind: "token" }>,
): boolean {
  return (typeof before?.initiative === "number") === (typeof after.initiative === "number");
}

/** L'incognito lo decide il GM: un giocatore non lo toglie né cambia nome e aspetto al token. */
function sameObscured(
  before: Extract<BoardItem, { kind: "token" }> | null,
  after: Extract<BoardItem, { kind: "token" }>,
): boolean {
  if (!!before?.obscured !== !!after.obscured) return false;
  return !before?.obscured || TOKEN_IDENTITY_KEYS.every((key) => before[key] === after[key]);
}

/**
 * I punti ferita li dà e li toglie il GM, come il massimo, la visibilità e la fascia: un giocatore
 * cambia solo attuali e temporanei, e solo se i PF sono visibili a tutti.
 */
function sameHitPointsShape(
  before: Extract<BoardItem, { kind: "token" }> | null,
  after: Extract<BoardItem, { kind: "token" }>,
): boolean {
  const old = before?.hp ?? null;
  const next = after.hp ?? null;
  const visibility = after.hpVisibility ?? "all";
  if (!old !== !next || (before?.hpVisibility ?? "all") !== visibility) return false;
  if ((before?.hpBand ?? null) !== (after.hpBand ?? null)) return false;
  if (!old || !next) return true;
  if (old.max !== next.max) return false;
  return visibility === "all" || (old.value === next.value && old.temp === next.temp);
}

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
  if (before && before.kind !== after.kind) return false;
  // Non si può cambiare il creatore di un oggetto per rubarne o cederne la proprietà.
  if (before && before.createdBy !== after.createdBy) return false;
  // I tetti overhead e i file video possono essere inseriti o modificati solo dal GM.
  if (after.kind === "image" && (after.overhead || isVideoAsset(after.assetId))) return false;
  // Visione, luce portata, assegnazione e punti ferita massimi dei token li decide il GM: un
  // giocatore non può darsi scurovisione, prendersi il token di un altro o curare un mostro.
  if (after.kind === "token") {
    const previous = before?.kind === "token" ? before : null;
    return (
      visionFields(previous) === visionFields(after) &&
      sameInitiativeMembership(previous, after) &&
      sameObscured(previous, after) &&
      sameHitPointsShape(previous, after)
    );
  }
  return true;
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

function clearSharedType(doc: Y.Doc, name: string): void {
  const type = doc.share.get(name) as { _start?: unknown } | undefined;
  if (!type) return;
  if (type._start !== null && type._start !== undefined) {
    const arr = doc.getArray(name);
    if (arr.length > 0) arr.delete(0, arr.length);
  } else {
    const map = doc.getMap(name);
    for (const k of [...map.keys()]) {
      map.delete(k);
    }
  }
}

/**
 * Controlla le modifiche dei giocatori al documento pubblico. Gli aggiornamenti Yjs non si
 * possono rifiutare senza chiudere la connessione (e il client li rimanderebbe a ogni
 * riconnessione), quindi il server li applica e subito dopo ripristina i valori precedenti con
 * una propria transazione: tutti i client convergono allo stato corretto.
 */
export function guardPublicDocument(doc: Y.Doc): void {
  const pendingTargets = new Map<Y.Map<unknown>, Map<string, TargetState>>();
  let microtaskScheduled = false;

  const recordPendingTarget = (map: Y.Map<unknown>, key: string, target: TargetState) => {
    let mapTargets = pendingTargets.get(map);
    if (!mapTargets) {
      mapTargets = new Map();
      pendingTargets.set(map, mapTargets);
    }
    // Only record the revert target if one is not already pending for this key.
    // This prevents subsequent unauthorized mutations within the same tick from
    // overwriting the true original value.
    if (!mapTargets.has(key)) {
      mapTargets.set(key, target);
    }
  };

  const getBaseline = (map: Y.Map<unknown>, key: string, changeOldValue: unknown) => {
    const mapTargets = pendingTargets.get(map);
    const target = mapTargets?.get(key);
    if (target) {
      return target.action === "set" ? target.value : undefined;
    }
    return changeOldValue;
  };

  const watch = (
    map: Y.Map<unknown>,
    allowed: (action: Action, key: string, oldValue: unknown) => boolean,
  ) => {
    map.observe((event, transaction) => {
      if (roleOf(transaction.origin) !== "player") return;
      event.changes.keys.forEach((change, key) => {
        const baseline = getBaseline(map, key, change.oldValue);
        const mapTargets = pendingTargets.get(map);
        const alreadyPending = mapTargets?.has(key) ?? false;
        if (!alreadyPending && allowed(change.action, key, baseline)) return;

        const target: TargetState =
          change.action === "add" && !alreadyPending
            ? { action: "delete" }
            : { action: "set", value: baseline };
        recordPendingTarget(map, key, target);
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
  // Il registro dei tiri lo scrive solo il server.
  watch(doc.getMap(ROLLS_MAP), () => false);
  watch(doc.getMap(SETTINGS_MAP), () => false);
  watch(fogMap, () => false);
  watch(doc.getMap(TERRAIN_MAP), () => false);

  const scheduleReverts = () => {
    if (microtaskScheduled) return;
    microtaskScheduled = true;
    queueMicrotask(() => {
      microtaskScheduled = false;
      doc.transact(() => {
        for (const [map, targets] of pendingTargets.entries()) {
          for (const [key, target] of targets.entries()) {
            if (target.action === "delete") {
              map.delete(key);
            } else {
              map.set(key, target.value);
            }
          }
        }
        pendingTargets.clear();

        // Rimuove mappe o collezioni radice non autorizzate introdotte dai giocatori.
        for (const name of doc.share.keys()) {
          if (!ALLOWED_PUBLIC_MAPS.has(name)) {
            clearSharedType(doc, name);
          }
        }
      }, GUARD_ORIGIN);
    });
  };

  doc.on("afterTransaction", (transaction) => {
    if (roleOf(transaction.origin) !== "player") return;

    let hasUnauthorizedRoots = false;
    for (const name of doc.share.keys()) {
      if (!ALLOWED_PUBLIC_MAPS.has(name)) {
        hasUnauthorizedRoots = true;
        break;
      }
    }

    if (pendingTargets.size > 0 || hasUnauthorizedRoots) {
      scheduleReverts();
    }
  });
}
