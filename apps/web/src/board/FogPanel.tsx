import type { BoardStore } from "./store";
import { type FogMode, type FogShape, useBoardUi } from "./tools";

const MODES: { mode: FogMode; label: string }[] = [
  { mode: "cover", label: "Copri" },
  { mode: "reveal", label: "Scopri" },
];
const SHAPES: { shape: FogShape; label: string }[] = [
  { shape: "rect", label: "Rettangolo" },
  { shape: "polygon", label: "Poligono" },
  { shape: "brush", label: "Pennello" },
];
const BRUSHES = [30, 60, 120];

/** Opzioni dello strumento nebbia (solo GM). */
export function FogPanel({ store }: { store: BoardStore }) {
  const { fogMode, fogShape, fogBrush, setFog } = useBoardUi();
  return (
    <div className="toolbar toolbar-style" role="toolbar" aria-label="Nebbia">
      {MODES.map((m) => (
        <button
          key={m.mode}
          type="button"
          className="text-button"
          aria-pressed={fogMode === m.mode}
          onClick={() => setFog({ fogMode: m.mode })}
        >
          {m.label}
        </button>
      ))}
      <span className="toolbar-separator" />
      {SHAPES.map((s) => (
        <button
          key={s.shape}
          type="button"
          className="text-button"
          aria-pressed={fogShape === s.shape}
          onClick={() => setFog({ fogShape: s.shape })}
        >
          {s.label}
        </button>
      ))}
      {fogShape === "brush" && (
        <>
          <span className="toolbar-separator" />
          {BRUSHES.map((w) => (
            <button
              key={w}
              type="button"
              className="icon-button"
              aria-pressed={fogBrush === w}
              aria-label={`Pennello ${w}`}
              title={`Pennello ${w}`}
              onClick={() => setFog({ fogBrush: w })}
            >
              <span className="width-dot" style={{ width: w / 6 + 4, height: w / 6 + 4 }} />
            </button>
          ))}
        </>
      )}
      <span className="toolbar-separator" />
      <button
        type="button"
        className="text-button"
        onClick={() => store.addFog({ mode: "cover", shape: "all", points: [] })}
      >
        Copri tutto
      </button>
      <button type="button" className="text-button" onClick={() => store.clearFog()}>
        Scopri tutto
      </button>
      {fogShape === "polygon" && (
        <span className="muted small fog-hint">
          Clic per i vertici, doppio clic o Invio per chiudere.
        </span>
      )}
    </div>
  );
}
