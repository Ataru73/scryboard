import type { LightingSettings } from "@scryboard/shared";
import type Konva from "konva";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Image, Layer } from "react-konva";
import type { Box } from "../board/viewport";
import type { ExploredMap } from "./explored";
import { drawLightGlow, drawVisibleArea } from "./render";
import type { LightSource, Polygons, VisionSource } from "./sources";

const DARKNESS = "#0b0a10";
/** Le zone esplorate ma non visibili restano in penombra. */
const EXPLORED_CLEAR = 0.45;

interface Props {
  /** "view": buio fuori dalla vista (giocatore o anteprima del GM); "glow": solo l'alone delle luci. */
  mode: "view" | "glow";
  /** Anteprima del GM: buio semitrasparente per orientarsi. */
  translucent: boolean;
  visions: VisionSource[];
  lights: LightSource[];
  polygons: Polygons;
  lighting: LightingSettings;
  explored: ExploredMap | null;
  exploredVersion: number;
  visible: Box;
  size: { width: number; height: number };
}

/**
 * Buio e luci, disegnati su un canvas grande quanto lo schermo e mostrato sopra i token: si
 * riempie di buio, si "bucano" la penombra delle zone esplorate e la zona visibile, poi si aggiunge
 * l'alone colorato delle luci dietro al buio (destination-over).
 */
export function VisionLayer(props: Props) {
  const {
    mode,
    translucent,
    visions,
    lights,
    polygons,
    lighting,
    explored,
    exploredVersion,
    visible,
    size,
  } = props;
  const canvas = useMemo(() => document.createElement("canvas"), []);
  const imageRef = useRef<Konva.Image>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `exploredVersion` segnala che la memoria è cambiata.
  useLayoutEffect(() => {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(size.width * ratio));
    canvas.height = Math.max(1, Math.round(size.height * ratio));
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const scale = canvas.width / visible.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, -visible.x * scale, -visible.y * scale);

    if (mode === "view") {
      ctx.fillStyle = DARKNESS;
      ctx.fillRect(visible.x, visible.y, visible.width, visible.height);
      ctx.globalCompositeOperation = "destination-out";
      const box = explored?.box;
      if (explored?.canvas && box) {
        ctx.globalAlpha = EXPLORED_CLEAR;
        ctx.drawImage(explored.canvas, box.x, box.y, box.width, box.height);
        ctx.globalAlpha = 1;
      }
      drawVisibleArea(ctx, visions, lights, polygons, lighting.ambient);
      ctx.globalCompositeOperation = "destination-over";
      drawLightGlow(ctx, lights, polygons, 1);
      ctx.globalCompositeOperation = "source-over";
    } else {
      drawLightGlow(ctx, lights, polygons, 0.8);
    }
    imageRef.current?.getLayer()?.batchDraw();
  }, [
    canvas,
    mode,
    visions,
    lights,
    polygons,
    lighting.ambient,
    explored,
    exploredVersion,
    visible.x,
    visible.y,
    visible.width,
    visible.height,
    size.width,
    size.height,
  ]);

  return (
    <Layer listening={false} opacity={translucent ? 0.75 : 1} name="vision">
      <Image
        ref={imageRef}
        image={canvas}
        x={visible.x}
        y={visible.y}
        width={visible.width}
        height={visible.height}
      />
    </Layer>
  );
}
