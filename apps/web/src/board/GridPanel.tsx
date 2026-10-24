import { useId, useSyncExternalStore } from "react";
import { normalizeOffset } from "./grid";
import type { BoardStore } from "./store";
import { useBoardUi } from "./tools";

interface Props {
  store: BoardStore;
  onClose: () => void;
}

/** Impostazioni della griglia, solo per il GM. */
export function GridPanel({ store, onClose }: Props) {
  const grid = useSyncExternalStore(store.subscribe, store.getGrid);
  const setTool = useBoardUi((s) => s.setTool);
  const ids = { enabled: useId(), size: useId(), x: useId(), y: useId() };

  const number = (value: string, fallback: number) => {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
  };

  return (
    <section className="panel grid-panel" aria-label="Griglia">
      <header>
        <h2>Griglia</h2>
        <button type="button" className="icon-button" aria-label="Chiudi" onClick={onClose}>
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
        Mostra la griglia
      </label>
      <div className="grid-fields">
        <label htmlFor={ids.size}>Casella (px)</label>
        <input
          id={ids.size}
          type="number"
          min={8}
          max={1000}
          step={0.5}
          value={grid.size}
          onChange={(e) => {
            const size = number(e.target.value, grid.size);
            if (size >= 8 && size <= 1000) {
              store.updateGrid({
                size,
                offsetX: normalizeOffset(grid.offsetX, size),
                offsetY: normalizeOffset(grid.offsetY, size),
              });
            }
          }}
        />
        <label htmlFor={ids.x}>Sposta X</label>
        <input
          id={ids.x}
          type="number"
          step={0.5}
          value={grid.offsetX}
          onChange={(e) =>
            store.updateGrid({
              offsetX: normalizeOffset(number(e.target.value, grid.offsetX), grid.size),
            })
          }
        />
        <label htmlFor={ids.y}>Sposta Y</label>
        <input
          id={ids.y}
          type="number"
          step={0.5}
          value={grid.offsetY}
          onChange={(e) =>
            store.updateGrid({
              offsetY: normalizeOffset(number(e.target.value, grid.offsetY), grid.size),
            })
          }
        />
      </div>
      <button type="button" className="primary" onClick={() => setTool("calibrate")}>
        Calibra sulla mappa
      </button>
      <p className="muted small">
        Traccia un riquadro su una casella della mappa: la griglia prenderà la stessa misura. Poi
        rifinisci con i campi qui sopra.
      </p>
    </section>
  );
}
