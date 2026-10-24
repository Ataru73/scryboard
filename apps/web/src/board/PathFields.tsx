import { PATH_STYLES, type PathItem, type PathStyleId } from "@scryboard/shared";
import { useId } from "react";
import { toFlat, toPathPoints } from "../paths/geometry";
import type { BoardStore } from "./store";
import { useBoardUi } from "./tools";

/**
 * Proprietà del percorso selezionato: stile, larghezza (del punto selezionato o di tutto il
 * percorso) ed eliminazione di un punto.
 */
export function PathFields({
  path,
  store,
  cellSize,
}: {
  path: PathItem;
  store: BoardStore;
  cellSize: number;
}) {
  const pathPoint = useBoardUi((s) => s.pathPoint);
  const setPathPoint = useBoardUi((s) => s.setPathPoint);
  const styleId = useId();
  const points = toPathPoints(path.points);
  const point = pathPoint !== null && pathPoint < points.length ? pathPoint : null;
  const width = point !== null ? (points[point]?.w ?? 0) : Math.max(...points.map((p) => p.w));

  const scaleWidth = (factor: number) => {
    const next = points.map((p, i) =>
      point === null || i === point
        ? { ...p, w: Math.min(cellSize * 10, Math.max(4, p.w * factor)) }
        : p,
    );
    store.update({ [path.id]: { points: toFlat(next) } });
  };

  return (
    <>
      <label htmlFor={styleId} className="visually-hidden">
        Stile del percorso
      </label>
      <select
        id={styleId}
        value={path.style}
        onChange={(e) => store.update({ [path.id]: { style: e.target.value as PathStyleId } })}
      >
        {PATH_STYLES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <span className="toolbar-separator" />
      <button
        type="button"
        className="icon-button"
        aria-label="Restringi"
        title={point !== null ? "Restringi il punto selezionato" : "Restringi tutto il percorso"}
        onClick={() => scaleWidth(0.8)}
      >
        −
      </button>
      <span className="path-width" title="Larghezza in caselle">
        {(width / cellSize).toFixed(1)} {point !== null ? `(punto ${point + 1})` : ""}
      </span>
      <button
        type="button"
        className="icon-button"
        aria-label="Allarga"
        title={point !== null ? "Allarga il punto selezionato" : "Allarga tutto il percorso"}
        onClick={() => scaleWidth(1.25)}
      >
        +
      </button>
      {point !== null && points.length > 2 && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            store.update({ [path.id]: { points: toFlat(points.filter((_, i) => i !== point)) } });
            setPathPoint(null);
          }}
        >
          Elimina punto
        </button>
      )}
      <span className="toolbar-separator" />
    </>
  );
}
