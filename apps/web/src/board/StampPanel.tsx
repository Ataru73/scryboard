import { STAMPS } from "@scryboard/shared";
import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { catalogLabel } from "../i18n/catalog";
import { stampImage } from "../stamps/generate";
import { useBoardUi } from "./tools";

/** Timbri di scenario (solo GM): clic per piazzarne uno, trascina per spargerne tanti. */
export function StampPanel() {
  const { t } = useTranslation();
  const { stampId, stampRandom, setStamp } = useBoardUi();
  const randomId = useId();
  const previews = useMemo(
    () => Object.fromEntries(STAMPS.map((s) => [s.id, stampImage(s.id, 0).toDataURL()])),
    [],
  );
  return (
    <div className="toolbar toolbar-style" role="toolbar" aria-label={t("tools.stamp.label")}>
      <div className="biome-palette">
        {STAMPS.map((s) => {
          const label = catalogLabel(t, "stamps", s.id, s.label);
          return (
            <button
              key={s.id}
              type="button"
              className="biome-button stamp-button"
              aria-pressed={stampId === s.id}
              aria-label={label}
              title={label}
              style={{ backgroundImage: `url(${previews[s.id]})` }}
              onClick={() => setStamp({ stampId: s.id })}
            />
          );
        })}
      </div>
      <span className="toolbar-separator" />
      <label className="checkbox small" htmlFor={randomId}>
        <input
          id={randomId}
          type="checkbox"
          checked={stampRandom}
          onChange={(e) => setStamp({ stampRandom: e.target.checked })}
        />
        {t("tools.stamp.random")}
      </label>
      <span className="muted small fog-hint">{t("tools.stamp.hint")}</span>
    </div>
  );
}
