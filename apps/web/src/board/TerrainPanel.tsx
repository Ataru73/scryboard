import { BIOMES, type BiomeId } from "@scryboard/shared";
import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { catalogLabel } from "../i18n/catalog";
import { biomeTexture } from "../terrain/textures";
import type { BoardStore } from "./store";
import { TERRAIN_SIZES, type TerrainMode, useBoardUi } from "./tools";

const MODES: { mode: TerrainMode }[] = [
  { mode: "brush" },
  { mode: "region" },
  { mode: "erase" },
  { mode: "fill" },
  { mode: "copy" },
  { mode: "paste" },
];

const HINT_MODES: TerrainMode[] = ["region", "fill", "copy", "paste"];

/** Tavolozza dei biomi e opzioni dello strumento Terreno (solo GM). */
export function TerrainPanel({ store }: { store: BoardStore }) {
  const { t } = useTranslation();
  const {
    terrainBiome,
    terrainMode,
    terrainSize,
    terrainExact,
    terrainUnderFog,
    terrainClipboard,
    recentBiomes,
    setTerrain,
  } = useBoardUi();
  const fogId = useId();
  const exactId = useId();
  const pick = (biome: BiomeId) =>
    setTerrain({
      terrainBiome: biome,
      // Scegliere un bioma dalla gomma o dagli strumenti di copia torna a dipingere.
      terrainMode: ["erase", "copy", "paste"].includes(terrainMode) ? "brush" : terrainMode,
    });
  // Anteprime delle texture, generate una volta.
  const previews = useMemo(
    () =>
      Object.fromEntries(BIOMES.map((b) => [b.id, biomeTexture(b.id).toDataURL()])) as Record<
        BiomeId,
        string
      >,
    [],
  );
  const hint = HINT_MODES.includes(terrainMode) ? t(`tools.terrain.hints.${terrainMode}`) : null;
  return (
    <div
      className="toolbar toolbar-style terrain-panel"
      role="toolbar"
      aria-label={t("tools.terrain.label")}
    >
      <fieldset className="recent-biomes" aria-label={t("tools.terrain.recent")}>
        {recentBiomes.map((id, i) => {
          const fallback = BIOMES.find((b) => b.id === id)?.label ?? id;
          const label = catalogLabel(t, "biomes", id, fallback);
          return (
            <button
              key={id}
              type="button"
              className="biome-button recent-biome"
              aria-pressed={terrainBiome === id}
              aria-label={t("tools.terrain.recentLabel", { index: i + 1, label })}
              title={t("tools.terrain.recentTitle", { label, key: i + 1 })}
              style={{ backgroundImage: `url(${previews[id]})` }}
              onClick={() => pick(id)}
            >
              <span className="recent-key">{i + 1}</span>
            </button>
          );
        })}
      </fieldset>
      <span className="toolbar-separator" />
      <div className="biome-palette">
        {BIOMES.map((b) => {
          const label = catalogLabel(t, "biomes", b.id, b.label);
          return (
            <button
              key={b.id}
              type="button"
              className="biome-button"
              aria-pressed={terrainBiome === b.id && terrainMode !== "erase"}
              aria-label={label}
              title={label}
              style={{ backgroundImage: `url(${previews[b.id]})` }}
              onClick={() => pick(b.id)}
            />
          );
        })}
      </div>
      <span className="toolbar-separator" />
      {MODES.map((m) => (
        <button
          key={m.mode}
          type="button"
          className="text-button"
          aria-pressed={terrainMode === m.mode}
          disabled={m.mode === "paste" && !terrainClipboard}
          onClick={() => setTerrain({ terrainMode: m.mode })}
        >
          {t(`tools.terrain.modes.${m.mode}`)}
        </button>
      ))}
      {(terrainMode === "brush" || terrainMode === "erase") && (
        <>
          <span className="toolbar-separator" />
          {TERRAIN_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              className="icon-button"
              aria-pressed={terrainSize === size}
              aria-label={t("tools.terrain.widthLabel", { count: size })}
              title={t("tools.terrain.widthTitle", { count: size })}
              onClick={() => setTerrain({ terrainSize: size })}
            >
              <span className="width-dot" style={{ width: 4 + size * 5, height: 4 + size * 5 }} />
            </button>
          ))}
        </>
      )}
      <span className="toolbar-separator" />
      <button type="button" className="text-button" onClick={() => store.clearTerrain()}>
        {t("tools.terrain.clear")}
      </button>
      <span className="toolbar-separator" />
      <label className="checkbox small" htmlFor={fogId} title={t("tools.terrain.underFog.title")}>
        <input
          id={fogId}
          type="checkbox"
          checked={terrainUnderFog}
          onChange={(e) => setTerrain({ terrainUnderFog: e.target.checked })}
        />
        {t("tools.terrain.underFog.label")}
      </label>
      {terrainMode === "region" && (
        <label className="checkbox small" htmlFor={exactId} title={t("tools.terrain.exact.title")}>
          <input
            id={exactId}
            type="checkbox"
            checked={terrainExact}
            onChange={(e) => setTerrain({ terrainExact: e.target.checked })}
          />
          {t("tools.terrain.exact.label")}
        </label>
      )}
      {hint && <span className="muted small fog-hint">{hint}</span>}
    </div>
  );
}
