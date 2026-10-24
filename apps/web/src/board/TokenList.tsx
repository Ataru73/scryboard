import type { BoardItem, GridSettings, TokenItem } from "@scryboard/shared";
import { cellAt } from "./grid";

/**
 * Elenco testuale dei token per chi usa uno screen reader (il canvas non è accessibile):
 * nome e casella occupata.
 */
export function TokenList({ items, grid }: { items: BoardItem[]; grid: GridSettings }) {
  const tokens = items.filter((i): i is TokenItem => i.kind === "token");
  return (
    <ul className="visually-hidden" aria-label="Token sulla lavagna">
      {tokens.map((t) => {
        const cell = cellAt(t, grid);
        return (
          <li key={t.id}>
            {t.name || "Token senza nome"}
            {grid.enabled && `, colonna ${cell.col + 1}, riga ${cell.row + 1}`}
            {t.locked && ", bloccato"}
          </li>
        );
      })}
    </ul>
  );
}
