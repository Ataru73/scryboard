import type { StampId } from "@scryboard/shared";
import { seededRandom } from "../terrain/noise";

/** Lato del canvas di un timbro; il timbro occupa il disco inscritto (o il quadrato, per i mobili). */
export const STAMP_PX = 256;
/** Varianti distinte per timbro: oltre si ripetono (bastano a non vedere copie identiche vicine). */
const VARIANTS = 8;

type Ctx = CanvasRenderingContext2D;
type Random = () => number;
const C = STAMP_PX / 2;

function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

function blob(ctx: Ctx, x: number, y: number, r: number, random: Random, bumps = 9) {
  // Un raggio per ogni lobo; l'ultimo coincide con il primo, così il contorno si chiude liscio.
  const radii = Array.from({ length: bumps }, () => r * (0.85 + random() * 0.3));
  const point = (i: number, scale = 1) => {
    const a = (i / bumps) * Math.PI * 2;
    const rr = (radii[i % bumps] as number) * scale;
    return [x + Math.cos(a) * rr, y + Math.sin(a) * rr] as const;
  };
  ctx.beginPath();
  ctx.moveTo(...point(0));
  for (let i = 1; i <= bumps; i++) {
    // Il punto di controllo sta a metà tra due lobi, un po' più fuori: il bordo si gonfia.
    const a = ((i - 0.5) / bumps) * Math.PI * 2;
    const rr = (((radii[(i - 1) % bumps] as number) + (radii[i % bumps] as number)) / 2) * 1.15;
    ctx.quadraticCurveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr, ...point(i));
  }
  ctx.closePath();
}

function tree(ctx: Ctx, random: Random) {
  const base = ["#3f7a34", "#4b8a3a", "#356b2c"][Math.floor(random() * 3)] as string;
  ctx.fillStyle = shade(base, -0.12);
  blob(ctx, C, C, C * 0.9, random, 11);
  ctx.fill();
  for (let i = 0; i < 9; i++) {
    const a = random() * Math.PI * 2;
    const d = random() * C * 0.45;
    ctx.fillStyle = shade(base, random() * 0.08);
    blob(ctx, C + Math.cos(a) * d, C + Math.sin(a) * d, C * (0.28 + random() * 0.15), random);
    ctx.fill();
  }
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI * 0.75 + (random() - 0.5);
    const d = random() * C * 0.5;
    ctx.fillStyle = shade(base, 0.12);
    blob(ctx, C + Math.cos(a) * d, C + Math.sin(a) * d, C * (0.1 + random() * 0.08), random);
    ctx.fill();
  }
}

function pine(ctx: Ctx, random: Random) {
  const base = "#2c5a33";
  const layers = 4;
  for (let l = 0; l < layers; l++) {
    const r = C * (0.92 - l * 0.2);
    const spikes = 11 - l;
    const offset = random() * Math.PI;
    ctx.fillStyle = shade(base, -0.1 + l * 0.06);
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = offset + (i / (spikes * 2)) * Math.PI * 2;
      const rr = i % 2 === 0 ? r : r * 0.62;
      const x = C + Math.cos(a) * rr;
      const y = C + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "#5a4127";
  ctx.beginPath();
  ctx.arc(C, C, C * 0.06, 0, Math.PI * 2);
  ctx.fill();
}

function bush(ctx: Ctx, random: Random) {
  const base = ["#5f9a45", "#6aa64c", "#548c3d"][Math.floor(random() * 3)] as string;
  for (let i = 0; i < 6; i++) {
    const a = random() * Math.PI * 2;
    const d = random() * C * 0.35;
    ctx.fillStyle = shade(base, -0.08 + random() * 0.14);
    blob(ctx, C + Math.cos(a) * d, C + Math.sin(a) * d, C * (0.35 + random() * 0.15), random);
    ctx.fill();
  }
  ctx.fillStyle = ["#d8504d", "#f2c94c", "#ffffff"][Math.floor(random() * 3)] as string;
  for (let i = 0; i < 7; i++) {
    const a = random() * Math.PI * 2;
    const d = random() * C * 0.55;
    ctx.beginPath();
    ctx.arc(C + Math.cos(a) * d, C + Math.sin(a) * d, C * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
}

function rock(ctx: Ctx, random: Random, scale: number) {
  const base = ["#7d7a76", "#8a8580", "#6f6b66"][Math.floor(random() * 3)] as string;
  const n = 7 + Math.floor(random() * 3);
  const points: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + random() * 0.4;
    const r = C * scale * (0.7 + random() * 0.3);
    points.push([C + Math.cos(a) * r, C + Math.sin(a) * r]);
  }
  ctx.fillStyle = base;
  ctx.beginPath();
  for (const [i, [x, y]] of points.entries()) {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  // Facce illuminate (in alto a sinistra) e in ombra.
  for (let i = 0; i < n; i++) {
    const [ax, ay] = points[i] as [number, number];
    const [bx, by] = points[(i + 1) % n] as [number, number];
    const mid = Math.atan2((ay + by) / 2 - C, (ax + bx) / 2 - C);
    const light = Math.cos(mid + Math.PI * 0.75);
    ctx.fillStyle = shade(base, light * 0.14);
    ctx.beginPath();
    ctx.moveTo(C + (random() - 0.5) * C * 0.2 * scale, C + (random() - 0.5) * C * 0.2 * scale);
    ctx.lineTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.closePath();
    ctx.fill();
  }
}

function wood(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  base: string,
  random: Random,
  planks: number,
) {
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = shade(base, -0.2);
  ctx.lineWidth = STAMP_PX * 0.012;
  for (let i = 1; i < planks; i++) {
    const py = y + (h / planks) * i;
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x + w, py);
    ctx.stroke();
  }
  ctx.strokeStyle = shade(base, -0.08);
  for (let i = 0; i < planks * 2; i++) {
    const py = y + random() * h;
    const px = x + random() * w * 0.7;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + w * (0.1 + random() * 0.2), py);
    ctx.stroke();
  }
  ctx.strokeStyle = shade(base, -0.3);
  ctx.lineWidth = STAMP_PX * 0.02;
  ctx.strokeRect(x, y, w, h);
}

function barrel(ctx: Ctx, random: Random) {
  const base = "#8a5a32";
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(C, C, C * 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#3d3a38";
  ctx.lineWidth = STAMP_PX * 0.035;
  for (const r of [0.86, 0.62]) {
    ctx.beginPath();
    ctx.arc(C, C, C * r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = shade(base, -0.15);
  ctx.lineWidth = STAMP_PX * 0.01;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + random() * 0.2;
    ctx.beginPath();
    ctx.moveTo(C + Math.cos(a) * C * 0.62, C + Math.sin(a) * C * 0.62);
    ctx.lineTo(C + Math.cos(a) * C * 0.86, C + Math.sin(a) * C * 0.86);
    ctx.stroke();
  }
}

function crate(ctx: Ctx, random: Random) {
  const s = STAMP_PX * 0.9;
  const o = (STAMP_PX - s) / 2;
  wood(ctx, o, o, s, s, "#a77845", random, 4);
  ctx.strokeStyle = "#6b4a2a";
  ctx.lineWidth = STAMP_PX * 0.04;
  ctx.beginPath();
  ctx.moveTo(o, o);
  ctx.lineTo(o + s, o + s);
  ctx.stroke();
}

function table(ctx: Ctx, random: Random) {
  wood(
    ctx,
    STAMP_PX * 0.05,
    STAMP_PX * 0.22,
    STAMP_PX * 0.9,
    STAMP_PX * 0.56,
    "#9a6b3c",
    random,
    5,
  );
}

function chair(ctx: Ctx, random: Random) {
  wood(
    ctx,
    STAMP_PX * 0.15,
    STAMP_PX * 0.25,
    STAMP_PX * 0.7,
    STAMP_PX * 0.65,
    "#8a5d33",
    random,
    3,
  );
  wood(
    ctx,
    STAMP_PX * 0.12,
    STAMP_PX * 0.08,
    STAMP_PX * 0.76,
    STAMP_PX * 0.16,
    "#6f4a28",
    random,
    1,
  );
}

function bed(ctx: Ctx, random: Random) {
  wood(ctx, STAMP_PX * 0.2, STAMP_PX * 0.02, STAMP_PX * 0.6, STAMP_PX * 0.96, "#7a5232", random, 1);
  const blanket = ["#a33f46", "#3f6aa3", "#5d8a4a"][Math.floor(random() * 3)] as string;
  ctx.fillStyle = blanket;
  ctx.fillRect(STAMP_PX * 0.24, STAMP_PX * 0.32, STAMP_PX * 0.52, STAMP_PX * 0.6);
  ctx.fillStyle = shade(blanket, 0.12);
  ctx.fillRect(STAMP_PX * 0.24, STAMP_PX * 0.32, STAMP_PX * 0.52, STAMP_PX * 0.08);
  ctx.fillStyle = "#efe9dc";
  ctx.beginPath();
  ctx.roundRect(
    STAMP_PX * 0.28,
    STAMP_PX * 0.08,
    STAMP_PX * 0.44,
    STAMP_PX * 0.18,
    STAMP_PX * 0.05,
  );
  ctx.fill();
}

const DRAW: Record<StampId, (ctx: Ctx, random: Random) => void> = {
  tree,
  pine,
  bush,
  rock: (ctx, random) => rock(ctx, random, 0.95),
  boulder: (ctx, random) => rock(ctx, random, 0.95),
  barrel,
  crate,
  table,
  chair,
  bed,
};

const cache = new Map<string, HTMLCanvasElement>();

/** Immagine del timbro per la variante data, generata una volta. */
export function stampImage(id: StampId, variant: number): HTMLCanvasElement {
  const v = ((variant % VARIANTS) + VARIANTS) % VARIANTS;
  const key = `${id}:${v}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = STAMP_PX;
  canvas.height = STAMP_PX;
  DRAW[id](
    canvas.getContext("2d") as Ctx,
    seededRandom(v * 7919 + id.length * 104729 + id.charCodeAt(0)),
  );
  cache.set(key, canvas);
  return canvas;
}
