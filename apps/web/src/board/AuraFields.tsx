import { DRAW_COLORS, type TokenItem } from "@scryboard/shared";
import { useId } from "react";
import { COLOR_NAMES } from "./colors";
import type { BoardStore } from "./store";

/** Aura attorno a un token: raggio in caselle dal bordo (0 la toglie) e colore. */
export function AuraFields({ token, store }: { token: TokenItem; store: BoardStore }) {
  const radiusId = useId();
  const colorId = useId();
  const aura = token.aura ?? null;
  return (
    <>
      <span className="field-group">
        <label htmlFor={radiusId} className="small muted">
          Aura (caselle)
        </label>
        <input
          id={radiusId}
          className="number-field"
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={aura?.radius ?? 0}
          onChange={(e) => {
            const radius = Number(e.target.value);
            if (!Number.isFinite(radius) || radius < 0 || radius > 100) return;
            store.update({
              [token.id]: {
                aura: radius === 0 ? null : { radius, color: aura?.color ?? token.color },
              },
            });
          }}
        />
      </span>
      {aura && (
        <>
          <label htmlFor={colorId} className="visually-hidden">
            Colore dell'aura
          </label>
          <select
            id={colorId}
            value={aura.color}
            onChange={(e) =>
              store.update({ [token.id]: { aura: { ...aura, color: e.target.value } } })
            }
          >
            {DRAW_COLORS.map((c) => (
              <option key={c} value={c}>
                {COLOR_NAMES[c] ?? c}
              </option>
            ))}
            {!(DRAW_COLORS as readonly string[]).includes(aura.color) && (
              <option value={aura.color}>{aura.color}</option>
            )}
          </select>
        </>
      )}
      <span className="toolbar-separator" />
    </>
  );
}
