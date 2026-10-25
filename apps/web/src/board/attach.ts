import type { BoardItem, TokenItem } from "@scryboard/shared";

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
  if (!isToken(child) || !isToken(parent))
    return "Si può agganciare solo un token a un altro token.";
  if (child.id === parent.id) return "Un token non si aggancia a se stesso.";
  const byId = new Map(items.map((i) => [i.id, i]));
  if (isToken(byId.get(parent.attachedTo ?? ""))) {
    return `«${parent.name || "Il token"}» è già agganciato a un altro: scegli quello principale.`;
  }
  if (items.some((i) => isToken(i) && i.attachedTo === child.id)) {
    return `A «${child.name || "questo token"}» sono già agganciati altri token: sganciali prima.`;
  }
  return null;
}

/** Il token a cui è agganciato, se esiste ancora (un genitore cancellato non conta). */
export function parentOf(items: BoardItem[], token: TokenItem): TokenItem | undefined {
  const parent = items.find((i) => i.id === token.attachedTo);
  return isToken(parent) ? parent : undefined;
}
