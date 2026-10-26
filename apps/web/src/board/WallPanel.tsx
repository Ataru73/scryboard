import { assetUrl, BIOMES, type BiomeId, type ImageItem, type WallKind } from "@scryboard/shared";
import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { GeminiError, listGeminiModels } from "../gemini/api";
import { pickDefaultVisionModel, prepareForAnalysis, traceWalls } from "../gemini/walls";
import { catalogLabel } from "../i18n/catalog";
import { storage, subscribeGeminiKey } from "../lib/storage";
import { projectTrace } from "../walls/fromImage";
import { terrainWallContours } from "../walls/fromTerrain";
import { newContours } from "../walls/geometry";
import { useAssetAuth } from "./assetAuth";
import { snapGridCorner } from "./grid";
import { TrashIcon } from "./icons";
import type { BoardStore } from "./store";
import { useBoardUi } from "./tools";

const KINDS: WallKind[] = ["wall", "door", "window", "invisible", "one-way", "terrain"];

/** La mappa di sfondo: l'immagine più grande del livello mappa. */
function mapImage(store: BoardStore): ImageItem | undefined {
  return store
    .getSnapshot()
    .filter((i): i is ImageItem => i.kind === "image" && i.layer === "map")
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];
}

/** Tipo di barriera e generazione automatica dai bordi di un bioma. */
export function WallPanel({ store, roomId }: { store: BoardStore; roomId: string }) {
  const { t } = useTranslation();
  const { wallKind, wallBiome, setWall } = useBoardUi();
  const gmToken = useAssetAuth();
  const geminiKey = useSyncExternalStore(subscribeGeminiKey, storage.getGeminiKey);
  const [tracing, setTracing] = useState(false);
  const terrain = useSyncExternalStore(store.subscribe, store.getTerrain);
  const [message, setMessage] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  /** Cosa fa ciascun tipo, per il suggerimento sotto la barra. */
  const kindHint =
    wallKind === "one-way" || wallKind === "terrain" ? t(`effects.walls.hints.${wallKind}`) : "";

  async function generate() {
    if (generating) return;
    setGenerating(true);
    setMessage(null);
    try {
      const contours = await terrainWallContours(terrain, wallBiome, store.getGrid().size);
      if (contours.length === 0) {
        setMessage(t("effects.walls.noEdges"));
        return;
      }
      // Rigenerando dallo stesso terreno si ottengono gli stessi contorni: niente doppioni.
      const fresh = newContours(contours, store.getWalls());
      if (fresh.length === 0) {
        setMessage(t("effects.walls.edgesAlreadyWalled"));
        return;
      }
      store.addWalls(fresh.map((points) => ({ kind: "wall", points })));
      const skipped = contours.length - fresh.length;
      setMessage(
        t("effects.walls.contoursCreated", { count: fresh.length }) +
          (skipped > 0 ? t("effects.walls.alreadyPresent", { skipped }) : "."),
      );
    } catch {
      setMessage(t("effects.walls.generateError"));
    } finally {
      setGenerating(false);
    }
  }

  /** Chiede a Gemini di tracciare i muri della mappa; l'insieme si annulla con un solo Ctrl+Z. */
  async function traceFromMap() {
    if (tracing || !geminiKey) return;
    const image = mapImage(store);
    if (!image) {
      setMessage(t("effects.walls.loadMapFirst"));
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
        setMessage(t("effects.walls.noWallsFound"));
        return;
      }
      store.addWalls(drafts);
      setMessage(t("effects.walls.wallsTraced", { count: drafts.length }));
    } catch (e) {
      setMessage(e instanceof GeminiError ? e.message : t("effects.walls.traceError"));
    } finally {
      setTracing(false);
    }
  }

  return (
    <div
      className="toolbar toolbar-style wall-panel"
      role="toolbar"
      aria-label={t("effects.walls.toolbarLabel")}
    >
      {KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          className="text-button"
          aria-pressed={wallKind === kind}
          onClick={() => setWall({ wallKind: kind })}
        >
          {t(`effects.walls.kinds.${kind}`)}
        </button>
      ))}
      <span className="muted small fog-hint">
        {wallKind === "door"
          ? t("effects.walls.doorInstruction")
          : t("effects.walls.drawInstruction", { hint: kindHint ? `${kindHint} ` : "" })}
      </span>
      <span className="toolbar-separator" />
      <label className="small muted" htmlFor="wall-biome">
        {t("effects.walls.edgesOf")}
      </label>
      <select
        id="wall-biome"
        value={wallBiome}
        onChange={(event) => setWall({ wallBiome: event.target.value as BiomeId })}
      >
        {BIOMES.map((biome) => (
          <option key={biome.id} value={biome.id}>
            {catalogLabel(t, "biomes", biome.id, biome.label)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="text-button"
        disabled={generating}
        onClick={() => void generate()}
      >
        {generating ? t("effects.walls.creating") : t("effects.walls.createFromEdges")}
      </button>
      {geminiKey && (
        <button
          type="button"
          className="text-button"
          disabled={tracing}
          title={t("effects.walls.traceTitle")}
          onClick={() => void traceFromMap()}
        >
          {tracing ? t("effects.walls.tracing") : t("effects.walls.traceWithGemini")}
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
  const { t } = useTranslation();
  useSyncExternalStore(store.subscribe, store.getWalls);
  const selectedWallId = useBoardUi((state) => state.selectedWallId);
  const selectWall = useBoardUi((state) => state.selectWall);
  const wall = selectedWallId ? store.getWall(selectedWallId) : undefined;
  if (!wall) return null;
  return (
    <div
      className="toolbar selection-panel"
      role="toolbar"
      aria-label={t("effects.walls.selection.toolbarLabel")}
    >
      <span className="small">{t(`effects.walls.kinds.${wall.kind}`)}</span>
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
              {t(`effects.walls.doorStates.${state}`)}
            </button>
          ))}
          <span className="toolbar-separator" />
          <button
            type="button"
            className="text-button"
            aria-pressed={wall.secret === true}
            title={t("effects.walls.selection.secretTitle")}
            onClick={() => store.updateWall(wall.id, { secret: !wall.secret })}
          >
            {t("effects.walls.selection.secret")}
          </button>
        </>
      )}
      {wall.kind === "one-way" && (
        <>
          <span className="toolbar-separator" />
          <button
            type="button"
            className="text-button"
            title={t("effects.walls.selection.reverseTitle")}
            onClick={() => store.updateWall(wall.id, { points: reversePoints(wall.points) })}
          >
            {t("effects.walls.selection.reverseDirection")}
          </button>
        </>
      )}
      <span className="muted small fog-hint">{t("effects.walls.selection.dragHint")}</span>
      <button
        type="button"
        className="icon-button"
        aria-label={t("effects.walls.selection.deleteLabel")}
        title={t("effects.walls.selection.deleteTitle")}
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
