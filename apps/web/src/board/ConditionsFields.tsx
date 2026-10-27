import {
  addCustomCondition,
  CONDITIONS,
  conditionKey,
  DRAW_COLORS,
  MAX_CONDITION_LABEL,
  removeCondition,
  setConditionRounds,
  type TokenItem,
  toggleCondition,
} from "@scryboard/shared";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { catalogLabel, colorLabel } from "../i18n/catalog";
import { COLOR_NAMES } from "./colors";
import { CONDITION_ICONS, conditionLabel } from "./conditionIcons";
import type { BoardStore } from "./store";

/** Colori delle personalizzate: quelli dei disegni tranne il nero, che sul badge scuro sparisce. */
const CUSTOM_COLORS = DRAW_COLORS.filter((c) => c !== "#1d1a24");

/**
 * Condizioni di uno o più token: un pulsante apre la fila delle icone da accendere e spegnere.
 * Con più token, un'icona è accesa se ce l'hanno tutti e il clic la mette o la toglie a tutti; con
 * uno solo si possono anche dare durate in round e aggiungere condizioni personalizzate.
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
      {open && tokens.length === 1 && tokens[0] && (
        <ConditionDetails token={tokens[0]} store={store} />
      )}
      <span className="toolbar-separator" />
    </>
  );
}

/** Durate e condizioni personalizzate di un token, sotto la fila delle icone. */
function ConditionDetails({ token, store }: { token: TokenItem; store: BoardStore }) {
  const { t } = useTranslation();
  const labelId = useId();
  const colorId = useId();
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<string>("#8e4ec6");
  const conditions = token.conditions ?? [];
  const added = label.trim() ? addCustomCondition(conditions, label, color) : null;
  const add = () => {
    if (!added) return;
    store.update({ [token.id]: { conditions: added } });
    setLabel("");
  };
  return (
    <fieldset className="condition-row condition-details">
      <legend className="visually-hidden">{t("effects.conditions.detailsLabel")}</legend>
      {conditions.map((condition) => {
        const key = conditionKey(condition);
        const name = conditionLabel(t, condition);
        return (
          <span key={key} className="field-group condition-detail">
            <span className="small">{name}</span>
            <input
              className="number-field"
              type="number"
              min={1}
              max={999}
              step={1}
              placeholder="∞"
              aria-label={t("effects.conditions.roundsFor", { label: name })}
              title={t("effects.conditions.roundsTitle")}
              value={condition.rounds ?? ""}
              onChange={(e) => {
                const value = e.target.value === "" ? null : Number(e.target.value);
                if (value !== null && !(Number.isInteger(value) && value >= 1 && value <= 999)) {
                  return;
                }
                store.update({
                  [token.id]: { conditions: setConditionRounds(conditions, key, value) },
                });
              }}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={t("effects.conditions.remove", { label: name })}
              title={t("effects.conditions.remove", { label: name })}
              onClick={() =>
                store.update({ [token.id]: { conditions: removeCondition(conditions, key) } })
              }
            >
              ×
            </button>
          </span>
        );
      })}
      <span className="field-group">
        <label htmlFor={labelId} className="visually-hidden">
          {t("effects.conditions.customLabel")}
        </label>
        <input
          id={labelId}
          className="custom-condition"
          maxLength={MAX_CONDITION_LABEL}
          placeholder={t("effects.conditions.customPlaceholder")}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <label htmlFor={colorId} className="visually-hidden">
          {t("effects.conditions.customColor")}
        </label>
        <select id={colorId} value={color} onChange={(e) => setColor(e.target.value)}>
          {CUSTOM_COLORS.map((c) => (
            <option key={c} value={c}>
              {colorLabel(t, c, COLOR_NAMES[c] ?? c)}
            </option>
          ))}
        </select>
        <button type="button" disabled={!added} onClick={add}>
          {t("effects.conditions.add")}
        </button>
      </span>
    </fieldset>
  );
}
