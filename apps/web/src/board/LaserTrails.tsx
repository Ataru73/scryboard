import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { PresenceUser } from "@scryboard/shared";
import type Konva from "konva";
import { useCallback, useEffect, useRef } from "react";
import { Shape } from "react-konva";
import { LASER_TRAIL_MS, type LaserState, LaserTrail, parseLaserState } from "./laser";

/** Spessore della scia sullo schermo, in pixel, a prescindere dallo zoom. */
const LASER_WIDTH = 5;

/**
 * Scie del puntatore di tutti (la propria arriva da `local`, senza aspettare l'awareness): ogni
 * punto svanisce in poco più di un secondo. Si ridisegna a ogni fotogramma solo finché c'è una
 * scia da mostrare, senza passare da React.
 */
export function LaserTrails({
  provider,
  local,
  localColor,
  scale,
}: {
  provider: HocuspocusProvider;
  local: LaserState | null;
  localColor: string;
  scale: number;
}) {
  const shapeRef = useRef<Konva.Shape>(null);
  const trails = useRef(new Map<string, { trail: LaserTrail; color: string }>());
  const frame = useRef<number | null>(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const animate = useRef(() => {});
  animate.current = () => {
    if (frame.current !== null) return;
    const tick = () => {
      const now = performance.now();
      for (const [key, { trail }] of trails.current) {
        if (!trail.prune(now)) trails.current.delete(key);
      }
      shapeRef.current?.getLayer()?.batchDraw();
      frame.current = trails.current.size > 0 ? requestAnimationFrame(tick) : null;
    };
    frame.current = requestAnimationFrame(tick);
  };

  // Stabile: usa solo ref. Aggiungere due volte lo stesso stato non duplica i punti.
  const ingest = useCallback((key: string, state: LaserState | null, color: string) => {
    if (!state) return;
    let entry = trails.current.get(key);
    if (!entry) {
      entry = { trail: new LaserTrail(), color };
      trails.current.set(key, entry);
    }
    entry.color = color;
    entry.trail.ingest(state, performance.now());
    animate.current();
  }, []);

  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    const update = () => {
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID || !state.user) return;
        ingest(String(clientId), parseLaserState(state.laser), (state.user as PresenceUser).color);
      });
    };
    update();
    awareness.on("change", update);
    return () => awareness.off("change", update);
  }, [provider, ingest]);

  useEffect(() => ingest("self", local, localColor), [local, localColor, ingest]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  return (
    <Shape
      ref={shapeRef}
      name="laser-trails"
      listening={false}
      sceneFunc={(context) => {
        const ctx = context._context;
        const now = performance.now();
        const width = LASER_WIDTH / scaleRef.current;
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (const { trail, color } of trails.current.values()) {
          const points = trail.points;
          // Prima un bordo scuro, poi il colore con un alone: si legge su mappe chiare e scure.
          for (const pass of ["edge", "core"] as const) {
            ctx.strokeStyle = pass === "edge" ? "#1d1a24" : color;
            ctx.shadowColor = color;
            ctx.shadowBlur = pass === "edge" ? 0 : 12;
            for (let i = 1; i < points.length; i++) {
              const a = points[i - 1];
              const b = points[i];
              if (!a || !b || a.stroke !== b.stroke) continue;
              // I punti più vecchi sono più trasparenti e più sottili: la scia si assottiglia.
              const life = Math.max(0, 1 - (now - b.at) / LASER_TRAIL_MS);
              const line = width * (0.35 + 0.65 * life);
              ctx.globalAlpha = pass === "edge" ? life * 0.45 : life;
              ctx.lineWidth = pass === "edge" ? line + 2 / scaleRef.current : line;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
          const head = points.at(-1);
          if (head) {
            ctx.globalAlpha = Math.max(0, 1 - (now - head.at) / LASER_TRAIL_MS);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(head.x, head.y, width * 0.9, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }}
    />
  );
}
