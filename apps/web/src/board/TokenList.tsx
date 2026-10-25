import { type BoardItem, type GridSettings, PORTRAITS, type TokenItem } from "@scryboard/shared";
import { parentOf } from "./attach";
import { cellAt } from "./grid";
import { PortraitGlyph } from "./PortraitPicker";

/**
 * Elenco testuale dei token per chi usa uno screen reader (il canvas non è accessibile):
 * nome e casella occupata.
 */
export function TokenList({
  items,
  grid,
  isHidden,
}: {
  items: BoardItem[];
  grid: GridSettings;
  isHidden: (id: string) => boolean;
}) {
  const tokens = items.filter((i): i is TokenItem => i.kind === "token");
  return (
    <ul className="visually-hidden" aria-label="Token sulla lavagna">
      {tokens.map((t) => {
        const cell = cellAt(t, grid);
        const portrait = t.assetId ? undefined : PORTRAITS.find((p) => p.id === t.portrait);
        return (
          <li key={t.id}>
            {portrait && <PortraitGlyph id={portrait.id} color={t.color} />}
            {t.name || "Token senza nome"}
            {grid.enabled && `, colonna ${cell.col + 1}, riga ${cell.row + 1}`}
            {portrait && `, immagine ${portrait.label}`}
            {parentOf(items, t) && `, agganciato a ${parentOf(items, t)?.name || "un token"}`}
            {t.locked && ", bloccato"}
            {isHidden(t.id) && ", nascosto"}
          </li>
        );
      })}
    </ul>
  );
}
