import { BIOMES, type BiomeId } from "@scryboard/shared";
import { useId, useMemo } from "react";
import { biomeTexture } from "../terrain/textures";
import type { BoardStore } from "./store";
import { TERRAIN_SIZES, type TerrainMode, useBoardUi } from "./tools";

const MODES: { mode: TerrainMode; label: string }[] = [
  { mode: "brush", label: "Pennello" },
  { mode: "region", label: "Regione" },
  { mode: "erase", label: "Gomma" },
  { mode: "fill", label: "Riempi" },
  { mode: "copy", label: "Copia" },
  { mode: "paste", label: "Incolla" },
];

const HINTS: Partial<Record<TerrainMode, string>> = {
  region: "Clic per i vertici, doppio clic o Invio per chiudere.",
  fill: "Clic dentro un'area chiusa da muri o da altri biomi.",
  copy: "Trascina un riquadro sul terreno da copiare.",
  paste: "Clic dove incollare il terreno copiato.",
};

/** Tavolozza dei biomi e opzioni dello strumento Terreno (solo GM). */
export function TerrainPanel({ store }: { store: BoardStore }) {
  const {
    terrainBiome,
    terrainMode,
    terrainSize,
    terrainUnderFog,
    terrainClipboard,
    recentBiomes,
    setTerrain,
  } = useBoardUi();
  const fogId = useId();
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
  return (
    <div className="toolbar toolbar-style terrain-panel" role="toolbar" aria-label="Terreno">
      <fieldset className="recent-biomes" aria-label="Biomi recenti">
        {recentBiomes.map((id, i) => (
          <button
            key={id}
            type="button"
            className="biome-button recent-biome"
            aria-pressed={terrainBiome === id}
            aria-label={`${i + 1}: ${BIOMES.find((b) => b.id === id)?.label}`}
            title={`${BIOMES.find((b) => b.id === id)?.label} (tasto ${i + 1})`}
            style={{ backgroundImage: `url(${previews[id]})` }}
            onClick={() => pick(id)}
          >
            <span className="recent-key">{i + 1}</span>
          </button>
        ))}
      </fieldset>
      <span className="toolbar-separator" />
      <div className="biome-palette">
        {BIOMES.map((b) => (
          <button
            key={b.id}
            type="button"
            className="biome-button"
            aria-pressed={terrainBiome === b.id && terrainMode !== "erase"}
            aria-label={b.label}
            title={b.label}
            style={{ backgroundImage: `url(${previews[b.id]})` }}
            onClick={() => pick(b.id)}
          />
        ))}
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
          {m.label}
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
              aria-label={`Larghezza ${size} caselle`}
              title={`Larghezza ${size} ${size === 1 ? "casella" : "caselle"}`}
              onClick={() => setTerrain({ terrainSize: size })}
            >
              <span className="width-dot" style={{ width: 4 + size * 5, height: 4 + size * 5 }} />
            </button>
          ))}
        </>
      )}
      <span className="toolbar-separator" />
      <button type="button" className="text-button" onClick={() => store.clearTerrain()}>
        Cancella terreno
      </button>
      <span className="toolbar-separator" />
      <label
        className="checkbox small"
        htmlFor={fogId}
        title="Ogni pennellata nasce coperta dalla nebbia: la riveli quando vuoi"
      >
        <input
          id={fogId}
          type="checkbox"
          checked={terrainUnderFog}
          onChange={(e) => setTerrain({ terrainUnderFog: e.target.checked })}
        />
        Sotto la nebbia
      </label>
      {HINTS[terrainMode] && <span className="muted small fog-hint">{HINTS[terrainMode]}</span>}
    </div>
  );
}
