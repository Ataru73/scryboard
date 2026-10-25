import type { TokenItem, TurnSettings } from "./board";

/** Token nell'ordine dei turni: iniziativa più alta per prima, l'id come spareggio stabile. */
export function initiativeOrder<T extends Pick<TokenItem, "id" | "initiative">>(tokens: T[]): T[] {
  return tokens
    .filter((t) => typeof t.initiative === "number")
    .sort(
      (a, b) =>
        (b.initiative as number) - (a.initiative as number) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

/**
 * Turno successivo (o precedente): se il token attivo non è più nell'ordine si riparte dal
 * primo; oltrepassando l'ultimo il round avanza (o torna indietro, fermandosi al primo).
 */
export function stepTurn(
  order: Pick<TokenItem, "id">[],
  turn: TurnSettings,
  direction: 1 | -1 = 1,
): TurnSettings {
  if (order.length === 0) return { activeId: null, round: turn.round };
  const index = order.findIndex((t) => t.id === turn.activeId);
  if (index === -1) return { activeId: (order[0] as { id: string }).id, round: turn.round };
  const next = index + direction;
  if (next >= order.length)
    return { activeId: (order[0] as { id: string }).id, round: turn.round + 1 };
  if (next < 0) {
    return turn.round > 1
      ? { activeId: (order[order.length - 1] as { id: string }).id, round: turn.round - 1 }
      : turn;
  }
  return { activeId: (order[next] as { id: string }).id, round: turn.round };
}
