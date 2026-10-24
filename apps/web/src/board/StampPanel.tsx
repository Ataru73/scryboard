import { STAMPS } from "@scryboard/shared";
import { useId, useMemo } from "react";
import { stampImage } from "../stamps/generate";
import { useBoardUi } from "./tools";

/** Timbri di scenario (solo GM): clic per piazzarne uno, trascina per spargerne tanti. */
export function StampPanel() {
  const { stampId, stampRandom, setStamp } = useBoardUi();
  const randomId = useId();
  const previews = useMemo(
    () => Object.fromEntries(STAMPS.map((s) => [s.id, stampImage(s.id, 0).toDataURL()])),
    [],
  );
  return (
    <div className="toolbar toolbar-style" role="toolbar" aria-label="Timbri">
      <div className="biome-palette">
        {STAMPS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="biome-button stamp-button"
            aria-pressed={stampId === s.id}
            aria-label={s.label}
            title={s.label}
            style={{ backgroundImage: `url(${previews[s.id]})` }}
            onClick={() => setStamp({ stampId: s.id })}
          />
        ))}
      </div>
      <span className="toolbar-separator" />
      <label className="checkbox small" htmlFor={randomId}>
        <input
          id={randomId}
          type="checkbox"
          checked={stampRandom}
          onChange={(e) => setStamp({ stampRandom: e.target.checked })}
        />
        Varia rotazione e taglia
      </label>
      <span className="muted small fog-hint">
        Clic per un timbro, trascina per spargerne tanti.
      </span>
    </div>
  );
}
