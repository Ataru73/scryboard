import { PATH_STYLES, type PathItem, type PathStyleId } from "@scryboard/shared";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { catalogLabel } from "../i18n/catalog";
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
  const { t } = useTranslation();
  const pathPoint = useBoardUi((s) => s.pathPoint);
  const setPathPoint = useBoardUi((s) => s.setPathPoint);
  const styleId = useId();
  const points = toPathPoints(path.points);
  const point = pathPoint !== null && pathPoint < points.length ? pathPoint : null;
  const width = point !== null ? (points[point]?.w ?? 0) : Math.max(...points.map((p) => p.w));
  const displayWidth = (width / cellSize).toFixed(1);

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
        {t("tools.pathFields.style")}
      </label>
      <select
        id={styleId}
        value={path.style}
        onChange={(e) => store.update({ [path.id]: { style: e.target.value as PathStyleId } })}
      >
        {PATH_STYLES.map((s) => (
          <option key={s.id} value={s.id}>
            {catalogLabel(t, "paths", s.id, s.label)}
          </option>
        ))}
      </select>
      <span className="toolbar-separator" />
      <button
        type="button"
        className="icon-button"
        aria-label={t("tools.pathFields.narrow")}
        title={
          point !== null ? t("tools.pathFields.narrowPoint") : t("tools.pathFields.narrowPath")
        }
        onClick={() => scaleWidth(0.8)}
      >
        −
      </button>
      <span className="path-width" title={t("tools.pathFields.widthTitle")}>
        {point !== null
          ? t("tools.pathFields.widthAtPoint", { width: displayWidth, point: point + 1 })
          : t("tools.pathFields.width", { width: displayWidth })}
      </span>
      <button
        type="button"
        className="icon-button"
        aria-label={t("tools.pathFields.widen")}
        title={point !== null ? t("tools.pathFields.widenPoint") : t("tools.pathFields.widenPath")}
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
          {t("tools.pathFields.deletePoint")}
        </button>
      )}
      <span className="toolbar-separator" />
    </>
  );
}
