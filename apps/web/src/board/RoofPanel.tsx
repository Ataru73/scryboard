import { ROOF_STYLES, type RoofStyle } from "@scryboard/shared";
import { useTranslation } from "react-i18next";
import { roofTexture } from "../terrain/textures";
import { useBoardUi } from "./tools";

const swatches = new Map<RoofStyle, string>();

/** Anteprima della texture per il pulsante, codificata una sola volta. */
function swatch(style: RoofStyle): string {
  let url = swatches.get(style);
  if (!url) {
    url = roofTexture(style).toDataURL();
    swatches.set(style, url);
  }
  return url;
}

/** Strumento Tetti (solo GM): stile del prossimo tetto e come si disegna. */
export function RoofPanel() {
  const { t } = useTranslation();
  const roofStyle = useBoardUi((s) => s.roofStyle);
  const setRoofStyle = useBoardUi((s) => s.setRoofStyle);
  return (
    <div className="toolbar toolbar-style" role="toolbar" aria-label={t("tools.roof.label")}>
      {ROOF_STYLES.map((style) => (
        <button
          key={style}
          type="button"
          className="text-button path-style-button"
          aria-pressed={roofStyle === style}
          onClick={() => setRoofStyle(style)}
        >
          <span
            className="path-swatch"
            style={{ backgroundImage: `url(${swatch(style)})`, backgroundSize: "200%" }}
          />
          {t(`tools.roof.styles.${style}`)}
        </button>
      ))}
      <span className="muted small fog-hint">{t("tools.roof.hint")}</span>
    </div>
  );
}
