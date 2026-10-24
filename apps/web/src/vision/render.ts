import type { LightingSettings } from "@scryboard/shared";
import type { LightSource, Polygons, VisionSource } from "./sources";

const HUGE = 1e6;

function polygonPath(ctx: CanvasRenderingContext2D, poly: number[]) {
  ctx.beginPath();
  for (let i = 0; i + 1 < poly.length; i += 2) {
    if (i === 0) ctx.moveTo(poly[i] as number, poly[i + 1] as number);
    else ctx.lineTo(poly[i] as number, poly[i + 1] as number);
  }
  ctx.closePath();
}

/** Quanto è illuminato tutto senza luci: di giorno pienamente, al crepuscolo un po' meno. */
const AMBIENT_LIGHT: Record<LightingSettings["ambient"], number> = {
  day: 1,
  twilight: 0.8,
  night: 0,
};

/**
 * Disegna in nero la zona visibile, con l'alfa pari a quanto si vede: 1 in piena luce, meno in
 * luce fioca o con la sola scurovisione. Con destination-out "buca" il buio; con source-over
 * accumula le zone esplorate. Il contesto è già in coordinate del mondo.
 *
 * Per ogni token: si ritaglia la sua linea di vista (e la portata), poi dentro si riempie la luce
 * ambientale, la scurovisione e le luci che arrivano lì (ritagliate dalla loro linea di vista).
 */
export function drawVisibleArea(
  ctx: CanvasRenderingContext2D,
  visions: VisionSource[],
  lights: LightSource[],
  polygons: Polygons,
  ambient: LightingSettings["ambient"],
) {
  const ambientLight = AMBIENT_LIGHT[ambient];
  for (const v of visions) {
    const poly = polygons.get(v.id);
    if (!poly) continue;
    ctx.save();
    polygonPath(ctx, poly);
    ctx.clip();
    if (v.range > 0) {
      ctx.beginPath();
      ctx.arc(v.x, v.y, v.range, 0, Math.PI * 2);
      ctx.clip();
    }
    ctx.fillStyle = "#000000";
    if (ambientLight > 0) {
      ctx.globalAlpha = ambientLight;
      ctx.fillRect(-HUGE, -HUGE, 2 * HUGE, 2 * HUGE);
    }
    if (ambientLight < 1) {
      if (v.darkvision > 0) {
        // La scurovisione vede "in bianco e nero": un po' meno della luce piena.
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.arc(v.x, v.y, v.darkvision, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const light of lights) {
        const lightPoly = polygons.get(light.id);
        if (!lightPoly) continue;
        ctx.save();
        polygonPath(ctx, lightPoly);
        ctx.clip();
        const gradient = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.dim);
        const brightStop = light.dim > 0 ? light.bright / light.dim : 0;
        gradient.addColorStop(0, "rgba(0,0,0,1)");
        gradient.addColorStop(Math.min(0.999, brightStop), "rgba(0,0,0,1)");
        gradient.addColorStop(Math.min(0.9995, brightStop + 0.0005), "rgba(0,0,0,0.7)");
        gradient.addColorStop(1, "rgba(0,0,0,0.55)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(light.x, light.y, light.dim, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }
}

/** Alone colorato delle luci, entro la loro linea di vista. */
export function drawLightGlow(
  ctx: CanvasRenderingContext2D,
  lights: LightSource[],
  polygons: Polygons,
  strength: number,
) {
  for (const light of lights) {
    const poly = polygons.get(light.id);
    if (!poly) continue;
    ctx.save();
    polygonPath(ctx, poly);
    ctx.clip();
    const gradient = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.dim);
    gradient.addColorStop(0, withAlpha(light.color, 0.35 * strength));
    gradient.addColorStop(1, withAlpha(light.color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(light.x, light.y, light.dim, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
