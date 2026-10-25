import { useTranslation } from "react-i18next";
import type { BoardStore } from "./store";
import { type FogMode, type FogShape, useBoardUi } from "./tools";

const MODES: { mode: FogMode }[] = [{ mode: "cover" }, { mode: "reveal" }];
const SHAPES: { shape: FogShape }[] = [{ shape: "rect" }, { shape: "polygon" }, { shape: "brush" }];
const BRUSHES = [30, 60, 120];

/** Opzioni dello strumento nebbia (solo GM). */
export function FogPanel({ store }: { store: BoardStore }) {
  const { t } = useTranslation();
  const { fogMode, fogShape, fogBrush, setFog } = useBoardUi();
  return (
    <div className="toolbar toolbar-style" role="toolbar" aria-label={t("tools.fog.label")}>
      {MODES.map((m) => (
        <button
          key={m.mode}
          type="button"
          className="text-button"
          aria-pressed={fogMode === m.mode}
          onClick={() => setFog({ fogMode: m.mode })}
        >
          {t(`tools.fog.modes.${m.mode}`)}
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
          {t(`tools.fog.shapes.${s.shape}`)}
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
              aria-label={t("tools.fog.brush", { size: w })}
              title={t("tools.fog.brush", { size: w })}
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
        {t("tools.fog.coverAll")}
      </button>
      <button type="button" className="text-button" onClick={() => store.clearFog()}>
        {t("tools.fog.revealAll")}
      </button>
      {fogShape === "polygon" && (
        <span className="muted small fog-hint">{t("tools.fog.polygonHint")}</span>
      )}
    </div>
  );
}
