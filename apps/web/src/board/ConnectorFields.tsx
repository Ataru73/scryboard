import { type ConnectorItem, DRAW_COLORS } from "@scryboard/shared";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { colorLabel } from "../i18n/catalog";
import { COLOR_NAMES } from "./colors";
import type { BoardStore } from "./store";

/** Etichetta, colore, punta e verso di un connettore. */
export function ConnectorFields({
  connector,
  store,
}: {
  connector: ConnectorItem;
  store: BoardStore;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  const colorId = useId();
  const [label, setLabel] = useState(connector.label);
  const update = (patch: Partial<ConnectorItem>) => store.update({ [connector.id]: patch });
  return (
    <>
      <label htmlFor={labelId} className="visually-hidden">
        {t("effects.connector.label")}
      </label>
      <input
        id={labelId}
        className="connector-label"
        value={label}
        maxLength={80}
        placeholder={t("effects.connector.labelPlaceholder")}
        onChange={(e) => setLabel(e.target.value)}
        // Si salva uscendo dal campo: un solo passo di annulla.
        onBlur={() => label !== connector.label && update({ label: label.trim() })}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      <label htmlFor={colorId} className="visually-hidden">
        {t("effects.connector.color")}
      </label>
      <select
        id={colorId}
        value={connector.color}
        onChange={(e) => update({ color: e.target.value })}
      >
        {DRAW_COLORS.map((c) => (
          <option key={c} value={c}>
            {colorLabel(t, c, COLOR_NAMES[c] ?? c)}
          </option>
        ))}
        {!(DRAW_COLORS as readonly string[]).includes(connector.color) && (
          <option value={connector.color}>{connector.color}</option>
        )}
      </select>
      <button
        type="button"
        aria-pressed={connector.arrow}
        title={t("effects.connector.arrowTitle")}
        onClick={() => update({ arrow: !connector.arrow })}
      >
        {t("effects.connector.arrow")}
      </button>
      <button
        type="button"
        title={t("effects.connector.reverseTitle")}
        onClick={() => update({ from: connector.to, to: connector.from })}
      >
        {t("effects.connector.reverse")}
      </button>
      <span className="toolbar-separator" />
    </>
  );
}
