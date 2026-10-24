import { useEffect, useState } from "react";
import { useBoardUi } from "../board/tools";
import type { Point } from "../board/viewport";
import { simplify } from "../terrain/geometry";
import type { PathPoint } from "./geometry";

interface Draft {
  points: PathPoint[];
  cursor: Point;
  /** Pulsante premuto: posizione sullo schermo alla pressione. */
  pressedAt: Point | null;
  /** Trascinando dal primo punto si disegna a mano libera. */
  freehand: boolean;
}

/** Spostamento oltre il quale una pressione diventa un tracciato a mano libera. */
const DRAG_THRESHOLD = 6;

/**
 * Disegno di un percorso: clic per i punti di controllo (doppio clic o Invio per finire, Esc
 * per annullare), oppure trascinamento a mano libera dal primo punto. [ e ] cambiano la
 * larghezza dei punti successivi.
 */
export function usePathDrawing({
  active,
  cellSize,
  onCreate,
}: {
  active: boolean;
  cellSize: number;
  onCreate: (points: PathPoint[]) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const pathWidth = useBoardUi((s) => s.pathWidth);
  const width = pathWidth * cellSize;

  const finish = (current: Draft | null) => {
    if (current && current.points.length >= 2) onCreate(current.points);
    setDraft(null);
  };

  useEffect(() => {
    if (!active) setDraft(null);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Enter") finish(draft);
      else if (e.key === "Escape") setDraft(null);
      else if (e.key === "[" || e.key === "]") {
        const ui = useBoardUi.getState();
        ui.setPathWidth(ui.pathWidth * (e.key === "]" ? 1.25 : 0.8));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function down(world: Point, screen: Point, scale: number) {
    const point = { x: world.x, y: world.y, w: width };
    if (!draft) {
      setDraft({ points: [point], cursor: world, pressedAt: screen, freehand: false });
      return;
    }
    const last = draft.points[draft.points.length - 1] as PathPoint;
    // Un secondo clic sull'ultimo punto è il doppio clic che chiude il percorso.
    if (Math.hypot(world.x - last.x, world.y - last.y) * scale < 4) {
      finish(draft);
      return;
    }
    setDraft({ ...draft, points: [...draft.points, point], cursor: world, pressedAt: screen });
  }

  function move(world: Point, screen: Point) {
    if (!draft) return;
    const { pressedAt } = draft;
    const startFreehand =
      !draft.freehand &&
      pressedAt !== null &&
      draft.points.length === 1 &&
      Math.hypot(screen.x - pressedAt.x, screen.y - pressedAt.y) > DRAG_THRESHOLD;
    if (draft.freehand || startFreehand) {
      const last = draft.points[draft.points.length - 1] as PathPoint;
      if (Math.hypot(world.x - last.x, world.y - last.y) < width * 0.5) {
        setDraft({ ...draft, cursor: world, freehand: true });
        return;
      }
      setDraft({
        ...draft,
        cursor: world,
        freehand: true,
        points: [...draft.points, { ...world, w: width }],
      });
      return;
    }
    setDraft({ ...draft, cursor: world });
  }

  function up() {
    if (!draft) return;
    if (draft.freehand) {
      // Il tracciato a mano libera ha molti punti: si tengono quelli che ne definiscono la forma.
      const flat = simplify(
        draft.points.flatMap((p) => [p.x, p.y]),
        width * 0.15,
      );
      const points: PathPoint[] = [];
      for (let i = 0; i + 1 < flat.length; i += 2)
        points.push({ x: flat[i] as number, y: flat[i + 1] as number, w: width });
      finish({ ...draft, points });
      return;
    }
    setDraft({ ...draft, pressedAt: null });
  }

  /** Punti da mostrare in anteprima: quelli fissati più il puntatore. */
  const preview: PathPoint[] | null = draft
    ? draft.freehand
      ? draft.points
      : [...draft.points, { ...draft.cursor, w: width }]
    : null;

  return { drawing: draft !== null, preview, down, move, up };
}
