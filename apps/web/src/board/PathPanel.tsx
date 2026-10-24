import { PATH_STYLES } from "@scryboard/shared";
import { PATH_LOOKS } from "../paths/styles";
import { PATH_WIDTHS, useBoardUi } from "./tools";

/** Stili e larghezza dello strumento Percorso (solo GM). */
export function PathPanel() {
  const { pathStyle, pathWidth, setPathStyle, setPathWidth } = useBoardUi();
  return (
    <div className="toolbar toolbar-style" role="toolbar" aria-label="Percorso">
      {PATH_STYLES.map((style) => (
        <button
          key={style.id}
          type="button"
          className="text-button path-style-button"
          aria-pressed={pathStyle === style.id}
          onClick={() => setPathStyle(style.id)}
        >
          <span className="path-swatch" style={{ background: PATH_LOOKS[style.id].preview }} />
          {style.label}
        </button>
      ))}
      <span className="toolbar-separator" />
      {PATH_WIDTHS.map((width) => (
        <button
          key={width}
          type="button"
          className="icon-button"
          aria-pressed={pathWidth === width}
          aria-label={`Larghezza ${width} caselle`}
          title={`Larghezza ${width} ${width === 1 ? "casella" : "caselle"} ([ e ] per regolarla)`}
          onClick={() => setPathWidth(width)}
        >
          <span className="width-dot" style={{ width: 4 + width * 5, height: 4 + width * 5 }} />
        </button>
      ))}
      <span className="muted small fog-hint">
        Clic per i punti (o trascina a mano libera), doppio clic o Invio per finire. [ e ] cambiano
        la larghezza dei punti successivi.
      </span>
    </div>
  );
}
