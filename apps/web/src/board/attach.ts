import type { BoardItem, TokenItem } from "@scryboard/shared";
import { i18n } from "../i18n";

const isToken = (item: BoardItem | undefined): item is TokenItem => item?.kind === "token";

/** Token agganciati a uno di quelli in movimento e che non si muovono già per conto loro. */
export function followers(items: BoardItem[], moving: ReadonlySet<string>): TokenItem[] {
  return items.filter(
    (i): i is TokenItem =>
      isToken(i) && !!i.attachedTo && moving.has(i.attachedTo) && !moving.has(i.id),
  );
}

/** Perché `child` non può essere agganciato a `parent`, o null se si può. */
export function attachError(
  items: BoardItem[],
  child: BoardItem | undefined,
  parent: BoardItem | undefined,
): string | null {
  if (!isToken(child) || !isToken(parent)) return i18n.t("core.attach.onlyTokens");
  if (child.id === parent.id) return i18n.t("core.attach.self");
  const byId = new Map(items.map((i) => [i.id, i]));
  if (isToken(byId.get(parent.attachedTo ?? ""))) {
    return i18n.t("core.attach.parentAlreadyAttached", {
      name: parent.name || i18n.t("core.attach.defaultParentName"),
    });
  }
  if (items.some((i) => isToken(i) && i.attachedTo === child.id)) {
    return i18n.t("core.attach.childHasFollowers", {
      name: child.name || i18n.t("core.attach.defaultChildName"),
    });
  }
  return null;
}

/** Il token a cui è agganciato, se esiste ancora (un genitore cancellato non conta). */
export function parentOf(items: BoardItem[], token: TokenItem): TokenItem | undefined {
  const parent = items.find((i) => i.id === token.attachedTo);
  return isToken(parent) ? parent : undefined;
}
