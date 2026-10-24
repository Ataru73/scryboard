import type { HocuspocusProvider } from "@hocuspocus/provider";
import { LIGHT_PRESETS, type LightingSettings } from "@scryboard/shared";
import { useId, useSyncExternalStore } from "react";
import type { BoardStore } from "./store";
import { useBoardUi } from "./tools";
import { usePlayers } from "./usePlayers";

const AMBIENTS: { ambient: LightingSettings["ambient"]; label: string }[] = [
  { ambient: "day", label: "Giorno" },
  { ambient: "twilight", label: "Crepuscolo" },
  { ambient: "night", label: "Notte" },
];

/** Strumento Luce (solo GM): luce da piazzare, visione dinamica, luce ambientale, anteprima. */
export function LightPanel({
  store,
  provider,
}: {
  store: BoardStore;
  provider: HocuspocusProvider;
}) {
  const lighting = useSyncExternalStore(store.subscribe, store.getLighting);
  const { lightPreset, setLightPreset, visionPreview, setVisionPreview } = useBoardUi();
  const players = usePlayers(provider);
  const enabledId = useId();
  const previewId = useId();
  return (
    <div className="toolbar toolbar-style light-panel" role="toolbar" aria-label="Luci">
      {LIGHT_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className="text-button path-style-button"
          aria-pressed={lightPreset === preset.id}
          title={`${preset.label}: luce piena ${preset.bright}, fioca fino a ${preset.dim} caselle`}
          onClick={() => setLightPreset(preset.id)}
        >
          <span className="path-swatch" style={{ background: preset.color }} />
          {preset.label}
        </button>
      ))}
      <span className="muted small fog-hint">Clic sulla lavagna per piazzare la luce.</span>
      <span className="toolbar-separator" />
      <label className="checkbox small" htmlFor={enabledId}>
        <input
          id={enabledId}
          type="checkbox"
          checked={lighting.enabled}
          onChange={(e) => store.updateLighting({ enabled: e.target.checked })}
        />
        Visione dinamica
      </label>
      {AMBIENTS.map((a) => (
        <button
          key={a.ambient}
          type="button"
          className="text-button"
          aria-pressed={lighting.ambient === a.ambient}
          onClick={() => store.updateLighting({ ambient: a.ambient })}
        >
          {a.label}
        </button>
      ))}
      <button
        type="button"
        className="text-button"
        title="I giocatori dimenticano le zone già esplorate"
        onClick={() => store.updateLighting({ explorationEpoch: lighting.explorationEpoch + 1 })}
      >
        Azzera esplorazione
      </button>
      <span className="toolbar-separator" />
      <label className="small muted" htmlFor={previewId}>
        Vista
      </label>
      <select
        id={previewId}
        value={visionPreview ?? ""}
        onChange={(e) => setVisionPreview(e.target.value || null)}
      >
        <option value="">GM (tutto)</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
