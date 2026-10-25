import { DIAGONAL_RULES, GRID_TYPES, type GridSettings } from "@scryboard/shared";
import { useId, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { catalogLabel } from "../i18n/catalog";
import { normalizeGridOffsets } from "./grid";
import type { BoardStore } from "./store";
import { useBoardUi } from "./tools";

interface Props {
  store: BoardStore;
  onClose: () => void;
}

/** Impostazioni della griglia, solo per il GM. */
export function GridPanel({ store, onClose }: Props) {
  const { t } = useTranslation();
  const grid = useSyncExternalStore(store.subscribe, store.getGrid);
  const setTool = useBoardUi((s) => s.setTool);
  const ids = {
    enabled: useId(),
    type: useId(),
    size: useId(),
    x: useId(),
    y: useId(),
    amount: useId(),
    unit: useId(),
    diagonals: useId(),
  };
  /** Aggiorna la griglia riportando gli offset al suo periodo (la griglia resta dov'è). */
  const update = (patch: Partial<GridSettings>) => {
    const next = { ...grid, ...patch };
    store.updateGrid({ ...patch, ...normalizeGridOffsets(next) });
  };

  const number = (value: string, fallback: number) => {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
  };

  return (
    <section className="panel grid-panel" aria-label={t("core.grid.label")}>
      <header>
        <h2>{t("core.grid.label")}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t("core.grid.close")}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <label className="checkbox" htmlFor={ids.enabled}>
        <input
          id={ids.enabled}
          type="checkbox"
          checked={grid.enabled}
          onChange={(e) => store.updateGrid({ enabled: e.target.checked })}
        />
        {t("core.grid.show")}
      </label>
      <div className="grid-fields">
        <label htmlFor={ids.type}>{t("core.grid.type")}</label>
        <select
          id={ids.type}
          value={grid.type}
          onChange={(e) => update({ type: e.target.value as GridSettings["type"] })}
        >
          {GRID_TYPES.map((type) => (
            <option key={type.id} value={type.id}>
              {catalogLabel(t, "gridTypes", type.id, type.label)}
            </option>
          ))}
        </select>
        <label htmlFor={ids.size} title={t("core.grid.cellSizeHint")}>
          {t("core.grid.cellSize")}
        </label>
        <input
          id={ids.size}
          type="number"
          min={8}
          max={1000}
          step={0.5}
          value={grid.size}
          onChange={(e) => {
            const size = number(e.target.value, grid.size);
            if (size >= 8 && size <= 1000) update({ size });
          }}
        />
        <label htmlFor={ids.x}>{t("core.grid.offsetX")}</label>
        <input
          id={ids.x}
          type="number"
          step={0.5}
          value={grid.offsetX}
          onChange={(e) => update({ offsetX: number(e.target.value, grid.offsetX) })}
        />
        <label htmlFor={ids.y}>{t("core.grid.offsetY")}</label>
        <input
          id={ids.y}
          type="number"
          step={0.5}
          value={grid.offsetY}
          onChange={(e) => update({ offsetY: number(e.target.value, grid.offsetY) })}
        />
      </div>
      <details className="grid-measure">
        <summary>{t("core.grid.ruler")}</summary>
        <div className="grid-fields">
          <label htmlFor={ids.amount} title={t("core.grid.cellScaleHint")}>
            {t("core.grid.oneCell")}
          </label>
          <span className="grid-scale">
            <input
              id={ids.amount}
              type="number"
              min={0.1}
              step={0.5}
              value={grid.scale.amount}
              onChange={(e) => {
                const amount = number(e.target.value, grid.scale.amount);
                if (amount > 0) store.updateGrid({ scale: { ...grid.scale, amount } });
              }}
            />
            <input
              id={ids.unit}
              type="text"
              maxLength={8}
              aria-label={t("core.grid.unit")}
              value={grid.scale.unit}
              onChange={(e) => store.updateGrid({ scale: { ...grid.scale, unit: e.target.value } })}
            />
          </span>
          {grid.type === "square" && (
            <>
              <label htmlFor={ids.diagonals}>{t("core.grid.diagonals")}</label>
              <select
                id={ids.diagonals}
                value={grid.diagonals}
                onChange={(e) =>
                  store.updateGrid({ diagonals: e.target.value as GridSettings["diagonals"] })
                }
              >
                {DIAGONAL_RULES.map((rule) => (
                  <option key={rule.id} value={rule.id}>
                    {catalogLabel(t, "diagonalRules", rule.id, rule.label)}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </details>
      <button type="button" className="primary" onClick={() => setTool("calibrate")}>
        {t("core.grid.calibrate")}
      </button>
      <p className="muted small">
        {t(grid.type === "square" ? "core.grid.helpSquare" : "core.grid.helpHex")}
      </p>
    </section>
  );
}
