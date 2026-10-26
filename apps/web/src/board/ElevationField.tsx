import type { TokenItem } from "@scryboard/shared";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { BoardStore } from "./store";

/** Quota del token nell'unità del righello (0 = a terra): il passo è una casella. */
export function ElevationField({ token, store }: { token: TokenItem; store: BoardStore }) {
  const { t } = useTranslation();
  const id = useId();
  const { scale } = store.getGrid();
  return (
    <>
      <span className="field-group">
        <label htmlFor={id} className="small muted" title={t("effects.elevation.title")}>
          {scale.unit
            ? t("effects.elevation.labelWithUnit", { unit: scale.unit })
            : t("effects.elevation.label")}
        </label>
        <input
          id={id}
          className="number-field"
          type="number"
          min={-100000}
          max={100000}
          step={scale.amount}
          value={token.elevation ?? 0}
          onChange={(e) => {
            const elevation = Number(e.target.value);
            if (!Number.isFinite(elevation) || Math.abs(elevation) > 100000) return;
            store.update({ [token.id]: { elevation } });
          }}
        />
      </span>
      <span className="toolbar-separator" />
    </>
  );
}
