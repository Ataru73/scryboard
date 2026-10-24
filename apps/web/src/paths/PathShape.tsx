import { PATH_STYLES, type PathStyleId } from "@scryboard/shared";
import { useMemo } from "react";
import { Line } from "react-konva";
import { applyTaper, catmullRom, pathOutline, toPathPoints } from "./geometry";
import { PATH_LOOKS } from "./styles";

const SELECTION_COLOR = "#8e7cf0";

/** Campioni della curva, assottigliati alle estremità per gli stili che lo prevedono. */
export function pathSamples(points: number[], style: PathStyleId) {
  const controls = toPathPoints(points);
  const samples = catmullRom(controls);
  const taper = PATH_STYLES.find((s) => s.id === style)?.taper;
  if (!taper) return samples;
  const widest = Math.max(...controls.map((p) => p.w));
  return applyTaper(samples, widest * 2.5);
}

/** Strada o fiume: fasce sovrapposte dal bordo (rive, cigli) al centro. */
export function PathShape({
  points,
  style,
  selected = false,
}: {
  points: number[];
  style: PathStyleId;
  selected?: boolean;
}) {
  const look = PATH_LOOKS[style];
  const outlines = useMemo(() => {
    const samples = pathSamples(points, style);
    return look.bands.map((band) => pathOutline(samples, look.roundCaps, band.widthScale));
  }, [points, style, look]);
  return (
    <>
      {look.bands.map((band, i) => (
        <Line
          // biome-ignore lint/suspicious/noArrayIndexKey: le fasce di uno stile sono fisse.
          key={i}
          points={outlines[i] as number[]}
          closed
          fill={band.color}
          // Konva accetta anche un canvas come pattern, ma il tipo dichiara solo le immagini.
          fillPatternImage={band.texture?.() as HTMLImageElement | undefined}
          opacity={band.opacity}
          perfectDrawEnabled={false}
        />
      ))}
      {selected && (
        <Line
          points={outlines[0] as number[]}
          closed
          stroke={SELECTION_COLOR}
          strokeWidth={2}
          strokeScaleEnabled={false}
          dash={[6, 4]}
          listening={false}
        />
      )}
    </>
  );
}
