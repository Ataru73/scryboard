import type { HocuspocusProvider } from "@hocuspocus/provider";
import { LIGHT_PRESETS, type LightingSettings, WEATHERS } from "@scryboard/shared";
import { useId, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { catalogLabel } from "../i18n/catalog";
import type { BoardStore } from "./store";
import { useBoardUi } from "./tools";
import { usePlayers } from "./usePlayers";

const AMBIENTS: LightingSettings["ambient"][] = ["day", "twilight", "night"];

/** Strumento Luce (solo GM): luce da piazzare, visione dinamica, luce ambientale, anteprima. */
export function LightPanel({
  store,
  provider,
}: {
  store: BoardStore;
  provider: HocuspocusProvider;
}) {
  const { t } = useTranslation();
  const lighting = useSyncExternalStore(store.subscribe, store.getLighting);
  const { lightPreset, setLightPreset, visionPreview, setVisionPreview } = useBoardUi();
  const players = usePlayers(provider);
  const enabledId = useId();
  const previewId = useId();
  const weatherId = useId();
  return (
    <div
      className="toolbar toolbar-style light-panel"
      role="toolbar"
      aria-label={t("effects.lighting.toolbarLabel")}
    >
      {LIGHT_PRESETS.map((preset) => {
        const label = catalogLabel(t, "lights", preset.id, preset.label);
        return (
          <button
            key={preset.id}
            type="button"
            className="text-button path-style-button"
            aria-pressed={lightPreset === preset.id}
            title={t("effects.lighting.presetTitle", {
              name: label,
              bright: preset.bright,
              dim: preset.dim,
            })}
            onClick={() => setLightPreset(preset.id)}
          >
            <span className="path-swatch" style={{ background: preset.color }} />
            {label}
          </button>
        );
      })}
      <span className="muted small fog-hint">{t("effects.lighting.placeHint")}</span>
      <span className="toolbar-separator" />
      <label className="checkbox small" htmlFor={enabledId}>
        <input
          id={enabledId}
          type="checkbox"
          checked={lighting.enabled}
          onChange={(e) => store.updateLighting({ enabled: e.target.checked })}
        />
        {t("effects.lighting.dynamicVision")}
      </label>
      {AMBIENTS.map((ambient) => (
        <button
          key={ambient}
          type="button"
          className="text-button"
          aria-pressed={lighting.ambient === ambient}
          onClick={() => store.updateLighting({ ambient })}
        >
          {t(`effects.lighting.ambients.${ambient}`)}
        </button>
      ))}
      <button
        type="button"
        className="text-button"
        title={t("effects.lighting.resetExplorationTitle")}
        onClick={() => store.updateLighting({ explorationEpoch: lighting.explorationEpoch + 1 })}
      >
        {t("effects.lighting.resetExploration")}
      </button>
      <span className="toolbar-separator" />
      <label className="small muted" htmlFor={weatherId}>
        {t("effects.lighting.weather")}
      </label>
      <select
        id={weatherId}
        value={lighting.weather}
        onChange={(e) =>
          store.updateLighting({ weather: e.target.value as LightingSettings["weather"] })
        }
      >
        {WEATHERS.map((weather) => (
          <option key={weather} value={weather}>
            {t(`effects.lighting.weathers.${weather}`)}
          </option>
        ))}
      </select>
      <span className="toolbar-separator" />
      <label className="small muted" htmlFor={previewId}>
        {t("effects.lighting.view")}
      </label>
      <select
        id={previewId}
        value={visionPreview ?? ""}
        onChange={(e) => setVisionPreview(e.target.value || null)}
      >
        <option value="">{t("effects.lighting.gmView")}</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
