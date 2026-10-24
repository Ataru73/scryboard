import type { WallKind } from "@scryboard/shared";
import { useEffect, useState } from "react";
import type { Point } from "../board/viewport";

interface Draft {
  points: Point[];
  cursor: Point;
}

/** Polilinea agganciata alla griglia: doppio clic o Invio per finire, Esc per annullare. */
export function useWallDrawing({
  active,
  kind,
  snap,
  onCreate,
}: {
  active: boolean;
  kind: WallKind;
  snap: (point: Point) => Point;
  onCreate: (points: number[]) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  /** Le porte sono un solo segmento e si completano al secondo punto. */
  const singleSegment = kind === "door";

  const finish = (current: Draft | null) => {
    if (current && current.points.length >= 2) {
      onCreate(current.points.flatMap((point) => [point.x, point.y]));
    }
    setDraft(null);
  };

  // Cambiando strumento o tipo di barriera si abbandona la bozza corrente.
  // biome-ignore lint/correctness/useExhaustiveDependencies: i valori segnalano quando azzerare la bozza.
  useEffect(() => {
    setDraft(null);
  }, [active, kind]);

  useEffect(() => {
    if (!active) return;
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.key === "Enter") finish(draft);
      else if (event.key === "Escape") setDraft(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function down(world: Point, scale: number, unsnapped = false) {
    const point = unsnapped ? world : snap(world);
    if (!draft) {
      setDraft({ points: [point], cursor: point });
      return;
    }
    const last = draft.points[draft.points.length - 1] as Point;
    // Il secondo clic sullo stesso angolo è il doppio clic che chiude la polilinea.
    if (Math.hypot(point.x - last.x, point.y - last.y) * scale < 4) {
      finish(draft);
      return;
    }
    const points = [...draft.points, point];
    if (singleSegment) finish({ ...draft, points });
    else setDraft({ ...draft, points, cursor: point });
  }

  function move(world: Point, unsnapped = false) {
    if (draft) setDraft({ ...draft, cursor: unsnapped ? world : snap(world) });
  }

  const preview = draft
    ? [...draft.points, draft.cursor].flatMap((point) => [point.x, point.y])
    : null;
  const vertices = draft?.points ?? null;
  return { drawing: draft !== null, preview, vertices, down, move };
}
