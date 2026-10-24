import { GRID_TYPES, type GridSettings } from "@scryboard/shared";
import { useId, useSyncExternalStore } from "react";
import { normalizeGridOffsets } from "./grid";
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
  const ids = { enabled: useId(), type: useId(), size: useId(), x: useId(), y: useId() };
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
        <label htmlFor={ids.type}>Tipo</label>
        <select
          id={ids.type}
          value={grid.type}
          onChange={(e) => update({ type: e.target.value as GridSettings["type"] })}
        >
          {GRID_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <label htmlFor={ids.size} title="Per gli esagoni: la distanza tra due lati opposti">
          Casella (px)
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
        <label htmlFor={ids.x}>Sposta X</label>
        <input
          id={ids.x}
          type="number"
          step={0.5}
          value={grid.offsetX}
          onChange={(e) => update({ offsetX: number(e.target.value, grid.offsetX) })}
        />
        <label htmlFor={ids.y}>Sposta Y</label>
        <input
          id={ids.y}
          type="number"
          step={0.5}
          value={grid.offsetY}
          onChange={(e) => update({ offsetY: number(e.target.value, grid.offsetY) })}
        />
      </div>
      <button type="button" className="primary" onClick={() => setTool("calibrate")}>
        Calibra sulla mappa
      </button>
      <p className="muted small">
        {grid.type === "square"
          ? "Traccia un riquadro su una casella della mappa: la griglia prenderà la stessa misura."
          : "Traccia un riquadro attorno a un esagono della mappa: la griglia ne prenderà misura e posizione."}{" "}
        Poi rifinisci con i campi qui sopra.
      </p>
    </section>
  );
}
