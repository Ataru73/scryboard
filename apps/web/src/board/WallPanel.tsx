import { BIOMES, type BiomeId, type DoorState, type WallKind } from "@scryboard/shared";
import { useState, useSyncExternalStore } from "react";
import { terrainWallContours } from "../walls/fromTerrain";
import { newContours } from "../walls/geometry";
import { TrashIcon } from "./icons";
import type { BoardStore } from "./store";
import { useBoardUi } from "./tools";

const KINDS: { kind: WallKind; label: string }[] = [
  { kind: "wall", label: "Muro" },
  { kind: "door", label: "Porta" },
  { kind: "window", label: "Finestra" },
  { kind: "invisible", label: "Invisibile" },
];

const DOOR_LABELS: Record<DoorState, string> = {
  open: "Aperta",
  closed: "Chiusa",
  locked: "A chiave",
};

/** Tipo di barriera e generazione automatica dai bordi di un bioma. */
export function WallPanel({ store }: { store: BoardStore }) {
  const { wallKind, wallBiome, setWall } = useBoardUi();
  const terrain = useSyncExternalStore(store.subscribe, store.getTerrain);
  const [message, setMessage] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  async function generate() {
    if (generating) return;
    setGenerating(true);
    setMessage(null);
    try {
      const contours = await terrainWallContours(terrain, wallBiome, store.getGrid().size);
      if (contours.length === 0) {
        setMessage("Nessun bordo trovato per questo bioma.");
        return;
      }
      // Rigenerando dallo stesso terreno si ottengono gli stessi contorni: niente doppioni.
      const fresh = newContours(contours, store.getWalls());
      if (fresh.length === 0) {
        setMessage("I muri di questi bordi ci sono già.");
        return;
      }
      store.addWalls(fresh.map((points) => ({ kind: "wall", points })));
      const skipped = contours.length - fresh.length;
      setMessage(
        `${fresh.length} ${fresh.length === 1 ? "contorno creato" : "contorni creati"}` +
          (skipped > 0 ? `, ${skipped} già presenti.` : "."),
      );
    } catch {
      setMessage("Non è stato possibile generare i muri da quest'area.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="toolbar toolbar-style wall-panel" role="toolbar" aria-label="Muri">
      {KINDS.map(({ kind, label }) => (
        <button
          key={kind}
          type="button"
          className="text-button"
          aria-pressed={wallKind === kind}
          onClick={() => setWall({ wallKind: kind })}
        >
          {label}
        </button>
      ))}
      <span className="muted small fog-hint">
        {wallKind === "door"
          ? "Clicca i due estremi della porta."
          : "Clic per i vertici, doppio clic o Invio per finire. Alt non aggancia."}
      </span>
      <span className="toolbar-separator" />
      <label className="small muted" htmlFor="wall-biome">
        Bordi di
      </label>
      <select
        id="wall-biome"
        value={wallBiome}
        onChange={(event) => setWall({ wallBiome: event.target.value as BiomeId })}
      >
        {BIOMES.map((biome) => (
          <option key={biome.id} value={biome.id}>
            {biome.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="text-button"
        disabled={generating}
        onClick={() => void generate()}
      >
        {generating ? "Creazione…" : "Crea muri dai bordi"}
      </button>
      {message && (
        <span className="muted small" role="status">
          {message}
        </span>
      )}
    </div>
  );
}

/** Proprietà della porta selezionata ed eliminazione di una barriera esistente. */
export function WallSelectionPanel({ store }: { store: BoardStore }) {
  useSyncExternalStore(store.subscribe, store.getWalls);
  const selectedWallId = useBoardUi((state) => state.selectedWallId);
  const selectWall = useBoardUi((state) => state.selectWall);
  const wall = selectedWallId ? store.getWall(selectedWallId) : undefined;
  if (!wall) return null;
  return (
    <div className="toolbar selection-panel" role="toolbar" aria-label="Muro selezionato">
      <span className="small">{KINDS.find(({ kind }) => kind === wall.kind)?.label}</span>
      {wall.kind === "door" && (
        <>
          <span className="toolbar-separator" />
          {(["open", "closed", "locked"] as const).map((state) => (
            <button
              key={state}
              type="button"
              className="text-button"
              aria-pressed={wall.door === state}
              onClick={() => store.updateWall(wall.id, { door: state })}
            >
              {DOOR_LABELS[state]}
            </button>
          ))}
        </>
      )}
      <span className="muted small fog-hint">Trascina i vertici per modificare.</span>
      <button
        type="button"
        className="icon-button"
        aria-label="Elimina muro"
        title="Elimina (Canc)"
        onClick={() => {
          store.removeWalls([wall.id]);
          selectWall(null);
        }}
      >
        {TrashIcon}
      </button>
    </div>
  );
}
