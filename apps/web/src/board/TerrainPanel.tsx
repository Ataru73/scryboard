import { BIOMES, type BiomeId } from "@scryboard/shared";
import { useMemo } from "react";
import { biomeTexture } from "../terrain/textures";
import type { BoardStore } from "./store";
import { TERRAIN_SIZES, type TerrainMode, useBoardUi } from "./tools";

const MODES: { mode: TerrainMode; label: string }[] = [
  { mode: "brush", label: "Pennello" },
  { mode: "region", label: "Regione" },
  { mode: "erase", label: "Gomma" },
];

/** Tavolozza dei biomi e opzioni dello strumento Terreno (solo GM). */
export function TerrainPanel({ store }: { store: BoardStore }) {
  const { terrainBiome, terrainMode, terrainSize, setTerrain } = useBoardUi();
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
            onClick={() =>
              setTerrain({
                terrainBiome: b.id,
                terrainMode: terrainMode === "erase" ? "brush" : terrainMode,
              })
            }
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
          onClick={() => setTerrain({ terrainMode: m.mode })}
        >
          {m.label}
        </button>
      ))}
      {terrainMode !== "region" && (
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
      {terrainMode === "region" && (
        <span className="muted small fog-hint">
          Clic per i vertici, doppio clic o Invio per chiudere.
        </span>
      )}
    </div>
  );
}
