import { type BoardItem, type GridSettings, PORTRAITS, type TokenItem } from "@scryboard/shared";
import { useTranslation } from "react-i18next";
import { catalogLabel } from "../i18n/catalog";
import { parentOf } from "./attach";
import { cellAt } from "./grid";
import { PortraitGlyph } from "./PortraitPicker";
import { vitalsText } from "./VitalsSummary";

/**
 * Elenco testuale dei token per chi usa uno screen reader (il canvas non è accessibile):
 * nome, casella occupata, punti ferita e condizioni.
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
  const { t } = useTranslation();
  const tokens = items.filter((i): i is TokenItem => i.kind === "token");
  return (
    <ul className="visually-hidden" aria-label={t("core.tokenList.label")}>
      {tokens.map((token) => {
        const cell = cellAt(token, grid);
        const portrait = token.assetId ? undefined : PORTRAITS.find((p) => p.id === token.portrait);
        const parent = parentOf(items, token);
        return (
          <li key={token.id}>
            {portrait && <PortraitGlyph id={portrait.id} color={token.color} />}
            {token.name ||
              (token.obscured ? t("core.tokenList.unknown") : t("core.tokenList.unnamed"))}
            {grid.enabled &&
              t("core.tokenList.position", { column: cell.col + 1, row: cell.row + 1 })}
            {portrait &&
              t("core.tokenList.portrait", {
                label: catalogLabel(t, "portraits", portrait.id, portrait.label),
              })}
            {parent &&
              t("core.tokenList.attached", {
                name: parent.name || t("core.tokenList.genericToken"),
              })}
            {vitalsText(t, token)}
            {token.locked && t("core.tokenList.locked")}
            {isHidden(token.id) && t("core.tokenList.hidden")}
            {token.obscured && token.name && t("core.tokenList.obscured")}
          </li>
        );
      })}
    </ul>
  );
}
