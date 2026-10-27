import { CONDITIONS, type TokenItem, toggleCondition } from "@scryboard/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { catalogLabel } from "../i18n/catalog";
import { CONDITION_ICONS } from "./conditionIcons";
import type { BoardStore } from "./store";

/**
 * Condizioni di uno o più token: un pulsante apre la fila delle icone da accendere e spegnere.
 * Con più token, un'icona è accesa se ce l'hanno tutti e il clic la mette o la toglie a tutti.
 */
export function ConditionsFields({ tokens, store }: { tokens: TokenItem[]; store: BoardStore }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const has = (token: TokenItem, id: string) => !!token.conditions?.some((c) => c.id === id);
  const count = tokens.length === 1 ? (tokens[0]?.conditions?.length ?? 0) : 0;
  return (
    <>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {count > 0
          ? t("effects.conditions.buttonCount", { count })
          : t("effects.conditions.button")}
      </button>
      {open && (
        <fieldset className="condition-row">
          <legend className="visually-hidden">{t("effects.conditions.label")}</legend>
          {CONDITIONS.map((condition) => {
            const on = tokens.every((token) => has(token, condition.id));
            const label = catalogLabel(t, "conditions", condition.id, condition.label);
            const icon = CONDITION_ICONS[condition.id];
            return (
              <button
                key={condition.id}
                type="button"
                className="icon-button condition-button"
                aria-pressed={on}
                aria-label={label}
                title={label}
                onClick={() =>
                  store.update(
                    Object.fromEntries(
                      tokens.map((token) => [
                        token.id,
                        { conditions: toggleCondition(token.conditions, condition.id, !on) },
                      ]),
                    ),
                  )
                }
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={icon.dash ? "3 2.5" : undefined}
                  aria-hidden="true"
                >
                  <path d={icon.path} />
                </svg>
              </button>
            );
          })}
        </fieldset>
      )}
      <span className="toolbar-separator" />
    </>
  );
}
