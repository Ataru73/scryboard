import { PATH_STYLES } from "@scryboard/shared";
import { useTranslation } from "react-i18next";
import { catalogLabel } from "../i18n/catalog";
import { PATH_LOOKS } from "../paths/styles";
import { PATH_WIDTHS, useBoardUi } from "./tools";

/** Stili e larghezza dello strumento Percorso (solo GM). */
export function PathPanel() {
  const { t } = useTranslation();
  const { pathStyle, pathWidth, setPathStyle, setPathWidth } = useBoardUi();
  return (
    <div className="toolbar toolbar-style" role="toolbar" aria-label={t("tools.path.label")}>
      {PATH_STYLES.map((style) => (
        <button
          key={style.id}
          type="button"
          className="text-button path-style-button"
          aria-pressed={pathStyle === style.id}
          onClick={() => setPathStyle(style.id)}
        >
          <span className="path-swatch" style={{ background: PATH_LOOKS[style.id].preview }} />
          {catalogLabel(t, "paths", style.id, style.label)}
        </button>
      ))}
      <span className="toolbar-separator" />
      {PATH_WIDTHS.map((width) => (
        <button
          key={width}
          type="button"
          className="icon-button"
          aria-pressed={pathWidth === width}
          aria-label={t("tools.path.widthLabel", { count: width })}
          title={t("tools.path.widthTitle", { count: width })}
          onClick={() => setPathWidth(width)}
        >
          <span className="width-dot" style={{ width: 4 + width * 5, height: 4 + width * 5 }} />
        </button>
      ))}
      <span className="muted small fog-hint">{t("tools.path.hint")}</span>
    </div>
  );
}
