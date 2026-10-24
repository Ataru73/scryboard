import type { TerrainOp } from "@scryboard/shared";
import { useEffect, useMemo, useState } from "react";
import { Image, Layer } from "react-konva";
import { TerrainTiles, tileResolution, visibleTileCoords } from "../terrain/tiles";
import type { Box } from "./viewport";

/** Tempo per frame dedicato a ridisegnare i tasselli: lascia spazio al resto dell'interfaccia. */
const FRAME_BUDGET_MS = 8;

/** Terreno dipinto, disegnato a tasselli: si ridisegna solo dove cambia qualcosa. */
export function TerrainLayer({
  ops,
  visible,
  scale,
}: {
  ops: TerrainOp[];
  visible: Box;
  scale: number;
}) {
  const tiles = useMemo(() => new TerrainTiles(), []);
  const [tick, setTick] = useState(0);
  // Durante il pan cambiano solo le coordinate: si aggiorna quando cambia l'insieme di tasselli.
  const resolution = tileResolution(scale);
  const coordsKey = visibleTileCoords(visible, resolution).join(";");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `visible` è riassunto da coordsKey.
  const updated = useMemo(() => {
    tiles.update(ops, visible, scale);
    return {};
  }, [tiles, ops, coordsKey, resolution]);

  // Porta avanti i ridisegni a piccoli blocchi, un frame alla volta.
  // biome-ignore lint/correctness/useExhaustiveDependencies: riparte a ogni aggiornamento.
  useEffect(() => {
    if (!tiles.pending) return;
    let frame = requestAnimationFrame(function step() {
      if (tiles.pump(FRAME_BUDGET_MS)) setTick((t) => t + 1);
      if (tiles.pending) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [tiles, updated]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` e `updated` segnalano nuovi contenuti.
  const views = useMemo(() => tiles.views(), [tiles, tick, updated]);
  if (views.length === 0) return null;
  return (
    // Il nome segnala i ridisegni in corso (lo usano i test di prestazioni).
    <Layer listening={false} name={tiles.pending ? "terrain terrain-pending" : "terrain"}>
      {views.map((t) => (
        <Image
          key={`${t.key}:${t.version}`}
          image={t.canvas}
          x={t.box.x}
          y={t.box.y}
          width={t.box.width}
          height={t.box.height}
        />
      ))}
    </Layer>
  );
}
