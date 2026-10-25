import {
  assetUrl,
  BIOMES,
  type BiomeId,
  type DoorState,
  type ImageItem,
  type WallKind,
} from "@scryboard/shared";
import { useState, useSyncExternalStore } from "react";
import { GeminiError, listGeminiModels } from "../gemini/api";
import { pickDefaultVisionModel, prepareForAnalysis, traceWalls } from "../gemini/walls";
import { storage, subscribeGeminiKey } from "../lib/storage";
import { projectTrace } from "../walls/fromImage";
import { terrainWallContours } from "../walls/fromTerrain";
import { newContours } from "../walls/geometry";
import { useAssetAuth } from "./assetAuth";
import { snapGridCorner } from "./grid";
import { TrashIcon } from "./icons";
import type { BoardStore } from "./store";
import { useBoardUi } from "./tools";

const KINDS: { kind: WallKind; label: string }[] = [
  { kind: "wall", label: "Muro" },
  { kind: "door", label: "Porta" },
  { kind: "window", label: "Finestra" },
  { kind: "invisible", label: "Invisibile" },
  { kind: "one-way", label: "Senso unico" },
  { kind: "terrain", label: "Terreno" },
];

/** Cosa fa ciascun tipo, per il suggerimento sotto la barra. */
const KIND_HINTS: Partial<Record<WallKind, string>> = {
  "one-way":
    "Dirupi e sporgenze: si vede attraverso solo nel verso delle frecce (sinistra di chi traccia).",
  terrain:
    "Colonne e rocce: si vede la faccia davanti ma non il retro (il secondo muro ferma la vista).",
};

const DOOR_LABELS: Record<DoorState, string> = {
  open: "Aperta",
  closed: "Chiusa",
  locked: "A chiave",
};

/** La mappa di sfondo: l'immagine più grande del livello mappa. */
function mapImage(store: BoardStore): ImageItem | undefined {
  return store
    .getSnapshot()
    .filter((i): i is ImageItem => i.kind === "image" && i.layer === "map")
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];
}

/** Tipo di barriera e generazione automatica dai bordi di un bioma. */
export function WallPanel({ store, roomId }: { store: BoardStore; roomId: string }) {
  const { wallKind, wallBiome, setWall } = useBoardUi();
  const gmToken = useAssetAuth();
  const geminiKey = useSyncExternalStore(subscribeGeminiKey, storage.getGeminiKey);
  const [tracing, setTracing] = useState(false);
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

  /** Chiede a Gemini di tracciare i muri della mappa; l'insieme si annulla con un solo Ctrl+Z. */
  async function traceFromMap() {
    if (tracing || !geminiKey) return;
    const image = mapImage(store);
    if (!image) {
      setMessage("Carica prima l'immagine di una mappa.");
      return;
    }
    setTracing(true);
    setMessage(null);
    try {
      const res = await fetch(assetUrl(roomId, image.assetId), {
        headers: gmToken ? { authorization: `Bearer ${gmToken}` } : {},
      });
      if (!res.ok) throw new Error("Immagine non disponibile.");
      const traced = await traceWalls({
        apiKey: geminiKey,
        model:
          storage.getGeminiVisionModel() ||
          pickDefaultVisionModel((await listGeminiModels(geminiKey)).vision),
        image: await prepareForAnalysis(await res.blob()),
      });
      const grid = store.getGrid();
      const drafts = projectTrace(
        traced,
        image,
        grid.enabled ? (p) => snapGridCorner(p, grid) : undefined,
      );
      if (drafts.length === 0) {
        setMessage("Gemini non ha trovato muri in questa mappa.");
        return;
      }
      store.addWalls(drafts);
      setMessage(
        `${drafts.length} ${drafts.length === 1 ? "muro tracciato" : "muri tracciati"}: controllali, Ctrl+Z annulla tutto.`,
      );
    } catch (e) {
      setMessage(e instanceof GeminiError ? e.message : "Non è stato possibile tracciare i muri.");
    } finally {
      setTracing(false);
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
          : `${KIND_HINTS[wallKind] ? `${KIND_HINTS[wallKind]} ` : ""}Clic per i vertici, doppio clic o Invio per finire. Alt non aggancia.`}
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
      {geminiKey && (
        <button
          type="button"
          className="text-button"
          disabled={tracing}
          title="Gemini traccia i muri dell'immagine di mappa più grande"
          onClick={() => void traceFromMap()}
        >
          {tracing ? "Analisi…" : "Traccia muri con Gemini"}
        </button>
      )}
      {message && (
        <span className="muted small" role="status">
          {message}
        </span>
      )}
    </div>
  );
}

/** Stessi punti in ordine inverso (coppie x, y): scambia il lato trasparente di un muro a senso unico. */
function reversePoints(points: number[]): number[] {
  const out: number[] = [];
  for (let i = points.length - 2; i >= 0; i -= 2)
    out.push(points[i] as number, points[i + 1] as number);
  return out;
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
      {wall.kind === "one-way" && (
        <>
          <span className="toolbar-separator" />
          <button
            type="button"
            className="text-button"
            title="Scambia il lato da cui si vede attraverso il muro"
            onClick={() => store.updateWall(wall.id, { points: reversePoints(wall.points) })}
          >
            Inverti il verso
          </button>
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
