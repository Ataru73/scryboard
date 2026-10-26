import type { BiomeId, RoofStyle } from "@scryboard/shared";
import { hashString, seededRandom, tileableFbm } from "./noise";

/** Lato della texture in pixel; nel mondo copre lo stesso numero di pixel. */
export const TEXTURE_SIZE = 256;

type Ctx = CanvasRenderingContext2D;
type Random = () => number;

interface BiomeStyle {
  /** Colori dal più scuro al più chiaro, distribuiti lungo il valore del rumore. */
  colors: string[];
  /** Celle di rumore per lato della texture: più alto = macchie più piccole. */
  period: number;
  octaves: number;
  /** Mappa a "creste" (1 - |2n - 1|): linee luminose, per la lava. */
  ridged?: boolean;
  detail?: (ctx: Ctx, random: Random) => void;
}

/** Disegna una forma anche sui lati opposti, così i dettagli vicino al bordo non si tagliano. */
function wrapped(draw: (dx: number, dy: number) => void) {
  for (const dx of [-TEXTURE_SIZE, 0, TEXTURE_SIZE]) {
    for (const dy of [-TEXTURE_SIZE, 0, TEXTURE_SIZE]) draw(dx, dy);
  }
}

function blades(colors: string[], count: number, length: number) {
  return (ctx: Ctx, random: Random) => {
    ctx.lineCap = "round";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < count; i++) {
      const x = random() * TEXTURE_SIZE;
      const y = random() * TEXTURE_SIZE;
      const angle = -Math.PI / 2 + (random() - 0.5) * 0.9;
      const l = length * (0.5 + random() * 0.8);
      ctx.strokeStyle = colors[Math.floor(random() * colors.length)] as string;
      wrapped((dx, dy) => {
        ctx.beginPath();
        ctx.moveTo(x + dx, y + dy);
        ctx.lineTo(x + dx + Math.cos(angle) * l, y + dy + Math.sin(angle) * l);
        ctx.stroke();
      });
    }
  };
}

function blobs(colors: string[], count: number, minR: number, maxR: number, alpha = 1) {
  return (ctx: Ctx, random: Random) => {
    ctx.globalAlpha = alpha;
    for (let i = 0; i < count; i++) {
      const x = random() * TEXTURE_SIZE;
      const y = random() * TEXTURE_SIZE;
      const r = minR + random() * (maxR - minR);
      const rx = r * (0.8 + random() * 0.4);
      ctx.fillStyle = colors[Math.floor(random() * colors.length)] as string;
      wrapped((dx, dy) => {
        ctx.beginPath();
        ctx.ellipse(x + dx, y + dy, rx, r, random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.globalAlpha = 1;
  };
}

function waves(color: string, count: number, alpha: number) {
  return (ctx: Ctx, random: Random) => {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    for (let i = 0; i < count; i++) {
      const x = random() * TEXTURE_SIZE;
      const y = random() * TEXTURE_SIZE;
      const w = 10 + random() * 18;
      wrapped((dx, dy) => {
        ctx.beginPath();
        ctx.moveTo(x + dx - w / 2, y + dy);
        ctx.quadraticCurveTo(x + dx, y + dy - 4, x + dx + w / 2, y + dy);
        ctx.stroke();
      });
    }
    ctx.globalAlpha = 1;
  };
}

function cracks(color: string, count: number, alpha: number) {
  return (ctx: Ctx, random: Random) => {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;
    for (let i = 0; i < count; i++) {
      let x = random() * TEXTURE_SIZE;
      let y = random() * TEXTURE_SIZE;
      const points: [number, number][] = [[x, y]];
      let angle = random() * Math.PI * 2;
      for (let s = 0; s < 5; s++) {
        angle += (random() - 0.5) * 1.2;
        x += Math.cos(angle) * (6 + random() * 10);
        y += Math.sin(angle) * (6 + random() * 10);
        points.push([x, y]);
      }
      wrapped((dx, dy) => {
        ctx.beginPath();
        for (const [k, [px, py]] of points.entries()) {
          if (k === 0) ctx.moveTo(px + dx, py + dy);
          else ctx.lineTo(px + dx, py + dy);
        }
        ctx.stroke();
      });
    }
    ctx.globalAlpha = 1;
  };
}

function speckles(colors: string[], count: number, size: number, alpha: number) {
  return (ctx: Ctx, random: Random) => {
    ctx.globalAlpha = alpha;
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = colors[Math.floor(random() * colors.length)] as string;
      ctx.fillRect(random() * TEXTURE_SIZE, random() * TEXTURE_SIZE, size, size);
    }
    ctx.globalAlpha = 1;
  };
}

const combine =
  (...details: ((ctx: Ctx, random: Random) => void)[]) =>
  (ctx: Ctx, random: Random) => {
    for (const detail of details) detail(ctx, random);
  };

/** Assi di legno con venature, sfumature tra una tavola e l'altra e chiodi alle giunture. */
function woodPlanks(ctx: Ctx, random: Random) {
  const rows = 8;
  const h = TEXTURE_SIZE / rows;
  const seamsPerRow: number[][] = [
    [128],
    [64, 192],
    [160],
    [96, 224],
    [128],
    [48, 176],
    [144],
    [80, 208],
  ];

  // 1. Tonalità sfalsata tra le assi
  for (let row = 0; row < rows; row++) {
    const y = row * h;
    const seams = [0, ...(seamsPerRow[row] ?? [128]), TEXTURE_SIZE];
    for (let s = 0; s + 1 < seams.length; s++) {
      const x0 = seams[s] as number;
      const x1 = seams[s + 1] as number;
      const shade = (random() - 0.5) * 0.22;
      ctx.fillStyle =
        shade >= 0
          ? `rgba(255, 235, 200, ${shade.toFixed(3)})`
          : `rgba(15, 8, 4, ${(-shade).toFixed(3)})`;
      ctx.fillRect(x0, y + 1, x1 - x0, h - 2);
    }
  }

  // 2. Fibre e venature del legno
  for (let row = 0; row < rows; row++) {
    const yBase = row * h;
    const grainCount = 3 + Math.floor(random() * 2);
    for (let g = 0; g < grainCount; g++) {
      const yRel = 4 + random() * (h - 8);
      const k1 = 1 + Math.floor(random() * 3);
      const k2 = k1 + 1 + Math.floor(random() * 2);
      const a1 = 0.8 + random() * 1.5;
      const a2 = 0.4 + random() * 1.0;
      const phi1 = random() * Math.PI * 2;
      const phi2 = random() * Math.PI * 2;
      const isDark = random() > 0.35;
      ctx.strokeStyle = isDark ? "rgba(35, 18, 8, 0.22)" : "rgba(255, 240, 210, 0.15)";
      ctx.lineWidth = 0.8 + random() * 0.6;
      ctx.beginPath();
      for (let x = 0; x <= TEXTURE_SIZE; x += 4) {
        const t = (x / TEXTURE_SIZE) * Math.PI * 2;
        const wave = Math.sin(t * k1 + phi1) * a1 + Math.sin(t * k2 + phi2) * a2;
        const py = yBase + yRel + wave;
        if (x === 0) ctx.moveTo(x, py);
        else ctx.lineTo(x, py);
      }
      ctx.stroke();
    }
  }

  // 3. Fessure orizzontali tra le file (sia interne che ai bordi per continuità)
  ctx.lineWidth = 1.5;
  for (let row = 0; row <= rows; row++) {
    const y = row * h;
    ctx.strokeStyle = "rgba(18, 9, 4, 0.75)";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(TEXTURE_SIZE, y);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 240, 210, 0.12)";
    ctx.beginPath();
    ctx.moveTo(0, y + 1.2);
    ctx.lineTo(TEXTURE_SIZE, y + 1.2);
    ctx.stroke();
  }

  // 4. Fessure verticali e chiodi
  for (let row = 0; row < rows; row++) {
    const y = row * h;
    const seams = seamsPerRow[row] ?? [];
    for (const sx of seams) {
      ctx.strokeStyle = "rgba(18, 9, 4, 0.75)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, y);
      ctx.lineTo(sx, y + h);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255, 240, 210, 0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx + 1, y);
      ctx.lineTo(sx + 1, y + h);
      ctx.stroke();

      const nails: [number, number][] = [
        [sx - 4, y + 6],
        [sx - 4, y + h - 6],
        [sx + 5, y + 6],
        [sx + 5, y + h - 6],
      ];
      for (const [nx, ny] of nails) {
        wrapped((dx, dy) => {
          ctx.fillStyle = "rgba(20, 12, 6, 0.85)";
          ctx.beginPath();
          ctx.arc(nx + dx, ny + dy, 1.2, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
          ctx.fillRect(nx + dx - 0.4, ny + dy - 0.4, 0.8, 0.8);
        });
      }
    }
  }
}

const STYLES: Record<BiomeId, BiomeStyle> = {
  grass: {
    colors: ["#3f6b2a", "#5a8a37", "#78a545"],
    period: 8,
    octaves: 4,
    detail: blades(["#355e22", "#8bb752", "#4d7d30"], 380, 7),
  },
  "dry-grass": {
    colors: ["#8a7a3c", "#ab9a52", "#c7b66c"],
    period: 8,
    octaves: 4,
    detail: blades(["#7a6a30", "#d1c17a", "#9a8a44"], 320, 7),
  },
  forest: {
    colors: ["#1f3b1c", "#2c5226", "#3c6a31"],
    period: 6,
    octaves: 3,
    detail: combine(
      blobs(["#1a3317", "#244a20"], 22, 14, 24, 0.9),
      blobs(["#3f7334", "#4c8a3c"], 30, 5, 10, 0.75),
    ),
  },
  rock: {
    colors: ["#5d5b58", "#7a7774", "#99958f"],
    period: 6,
    octaves: 5,
    detail: combine(cracks("#3e3c3a", 26, 0.7), speckles(["#b3aea6", "#4d4b48"], 500, 1.5, 0.5)),
  },
  gravel: {
    colors: ["#77706a", "#8e877e", "#a59d92"],
    period: 12,
    octaves: 3,
    detail: blobs(["#6a635c", "#b0a89c", "#857d73", "#9b9389"], 420, 1.5, 3.5),
  },
  sand: {
    colors: ["#c9ad74", "#d9c18a", "#e7d3a2"],
    period: 6,
    octaves: 4,
    detail: speckles(["#b89a62", "#f0e2bd"], 1600, 1, 0.55),
  },
  snow: {
    colors: ["#d9e2ea", "#e9eff4", "#f7fafc"],
    period: 5,
    octaves: 4,
    detail: speckles(["#ffffff", "#c9d7e4"], 600, 1.5, 0.7),
  },
  ice: {
    colors: ["#9ccbe0", "#b8dcec", "#d6ecf5"],
    period: 4,
    octaves: 4,
    detail: cracks("#ffffff", 18, 0.6),
  },
  mud: {
    colors: ["#4e3a26", "#614a31", "#77603f"],
    period: 7,
    octaves: 4,
    detail: blobs(["#3f2e1d", "#5a4a3a"], 40, 4, 11, 0.6),
  },
  swamp: {
    colors: ["#3c4a2b", "#4f5f36", "#627443"],
    period: 7,
    octaves: 4,
    detail: combine(
      blobs(["#3b5b55", "#456a62"], 14, 8, 18, 0.75),
      blades(["#5f7a3a", "#2f3d20"], 120, 9),
    ),
  },
  "shallow-water": {
    colors: ["#4f97b8", "#62a9c7", "#7cbcd6"],
    period: 5,
    octaves: 3,
    detail: waves("#d7eef7", 50, 0.6),
  },
  "deep-water": {
    colors: ["#163f63", "#1d5079", "#27618e"],
    period: 5,
    octaves: 3,
    detail: waves("#5d93bd", 40, 0.55),
  },
  lava: {
    colors: ["#2a120b", "#5a1d0c", "#c2410c", "#fb923c", "#fde68a"],
    period: 6,
    octaves: 4,
    ridged: true,
    detail: speckles(["#fdba74"], 150, 1.5, 0.6),
  },
  wood: {
    colors: ["#523019", "#6b4124", "#84532f", "#9d673b"],
    period: 8,
    octaves: 4,
    detail: woodPlanks,
  },
};

function parseHex(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Colore lungo la sequenza `colors` per t in [0, 1]. */
export function samplePalette(colors: string[], t: number): [number, number, number] {
  const rgb = colors.map(parseHex);
  const pos = Math.min(0.9999, Math.max(0, t)) * (rgb.length - 1);
  const i = Math.floor(pos);
  const f = pos - i;
  const a = rgb[i] as [number, number, number];
  const b = rgb[i + 1] ?? a;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Colore medio del bioma, per anteprime e tratti in corso. */
export function biomeColor(id: BiomeId): string {
  const [r, g, b] = samplePalette(STYLES[id].colors, 0.5);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/** Pietre di un selciato, disposte a file sfalsate. */
function cobbles(ctx: Ctx, random: Random) {
  const rows = 8;
  const h = TEXTURE_SIZE / rows;
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 === 0 ? 0 : h * 0.7;
    for (let x = -h; x < TEXTURE_SIZE + h; x += h * 1.4) {
      const w = h * (1.15 + random() * 0.2);
      const cx = x + offset + w / 2;
      const cy = row * h + h / 2;
      const shade = 0.85 + random() * 0.3;
      const [r, g, b] = [120 * shade, 114 * shade, 106 * shade].map(Math.round);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      wrapped((dx, dy) => {
        ctx.beginPath();
        ctx.roundRect(cx - w / 2 + 1.5 + dx, cy - h / 2 + 1.5 + dy, w - 3, h - 3, h * 0.3);
        ctx.fill();
      });
    }
  }
}

/** Texture dei percorsi, generate come quelle dei biomi. */
export type PathTextureId = "trail" | "dirt" | "cobble";

const PATH_TEXTURES: Record<PathTextureId, BiomeStyle> = {
  trail: {
    colors: ["#8a6f48", "#a3875c", "#b99f72"],
    period: 8,
    octaves: 4,
    detail: speckles(["#6f5838", "#cdb68a"], 700, 1.5, 0.6),
  },
  dirt: {
    colors: ["#6f5536", "#84693f", "#9a7f52"],
    period: 7,
    octaves: 4,
    detail: combine(
      speckles(["#5a4429", "#ad9467"], 900, 1.5, 0.6),
      blobs(["#5f4a30"], 30, 3, 8, 0.4),
    ),
  },
  cobble: {
    colors: ["#4b4641", "#57514b", "#625b54"],
    period: 6,
    octaves: 2,
    detail: cobbles,
  },
};

/** Tegole curve: file sfalsate di coppi, con l'ombra sotto il bordo di ognuno. */
function roofTiles(ctx: Ctx, random: Random) {
  const rows = 8;
  const h = TEXTURE_SIZE / rows;
  const w = TEXTURE_SIZE / 8;
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 === 0 ? 0 : w / 2;
    for (let x = -w; x < TEXTURE_SIZE + w; x += w) {
      const cx = x + offset + w / 2;
      const bottom = (row + 1) * h;
      const shade = 0.85 + random() * 0.3;
      const r = 178 * shade;
      const g = 84 * shade;
      const b = 52 * shade;
      wrapped((dx, dy) => {
        // Il coppo: un arco che chiude in basso, più chiaro al centro.
        const gradient = ctx.createLinearGradient(cx - w / 2 + dx, 0, cx + w / 2 + dx, 0);
        const rgb = (k: number) =>
          `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`;
        gradient.addColorStop(0, rgb(0.75));
        gradient.addColorStop(0.5, rgb(1));
        gradient.addColorStop(1, rgb(0.7));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(cx - w / 2 + dx, bottom - h + dy);
        ctx.lineTo(cx - w / 2 + dx, bottom - w / 2 + dy);
        ctx.arc(cx + dx, bottom - w / 2 + dy, w / 2, Math.PI, 0, true);
        ctx.lineTo(cx + w / 2 + dx, bottom - h + dy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(60, 25, 15, 0.55)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }
  }
}

/** Lastre di ardesia: rettangoli sfalsati con giunture scure e qualche lastra più chiara. */
function slates(ctx: Ctx, random: Random) {
  const rows = 8;
  const h = TEXTURE_SIZE / rows;
  const w = TEXTURE_SIZE / 6;
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 === 0 ? 0 : w / 2;
    for (let x = -w; x < TEXTURE_SIZE + w; x += w) {
      const shade = 0.8 + random() * 0.4;
      const [r, g, b] = [86 * shade, 96 * shade, 110 * shade].map(Math.round);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      wrapped((dx, dy) => {
        ctx.beginPath();
        ctx.roundRect(x + offset + 1 + dx, row * h + 1 + dy, w - 2, h - 2, 2);
        ctx.fill();
        // L'ombra della fila sopra.
        ctx.fillStyle = "rgba(20, 24, 32, 0.35)";
        ctx.fillRect(x + offset + 1 + dx, row * h + 1 + dy, w - 2, h * 0.18);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      });
    }
  }
}

/** Paglia: fasci di steli in file orizzontali, con il bordo inferiore di ogni fila in ombra. */
function thatchCourses(ctx: Ctx, random: Random) {
  const rows = 6;
  const h = TEXTURE_SIZE / rows;
  ctx.lineCap = "round";
  for (let row = 0; row < rows; row++) {
    const top = row * h;
    for (let i = 0; i < 260; i++) {
      const x = random() * TEXTURE_SIZE;
      const y = top + random() * h * 0.6;
      const l = h * (0.5 + random() * 0.5);
      const tilt = (random() - 0.5) * 0.25;
      ctx.strokeStyle = ["#c9a95c", "#b08f45", "#dcc07a", "#9a7a3a"][
        Math.floor(random() * 4)
      ] as string;
      ctx.lineWidth = 1 + random();
      wrapped((dx, dy) => {
        ctx.beginPath();
        ctx.moveTo(x + dx, y + dy);
        ctx.lineTo(x + dx + tilt * l, y + dy + l);
        ctx.stroke();
      });
    }
    ctx.fillStyle = "rgba(70, 50, 20, 0.35)";
    ctx.fillRect(0, top + h * 0.88, TEXTURE_SIZE, h * 0.12);
  }
}

const ROOF_TEXTURES: Record<RoofStyle, BiomeStyle> = {
  shingles: { colors: ["#6e2f1c", "#80381f"], period: 4, octaves: 1, detail: roofTiles },
  thatch: {
    colors: ["#8a6a30", "#a5844a", "#bb9a58"],
    period: 6,
    octaves: 3,
    detail: thatchCourses,
  },
  slate: { colors: ["#1f242c", "#2a3038"], period: 4, octaves: 1, detail: slates },
};

const textures = new Map<string, HTMLCanvasElement>();

/** Texture del bioma, generata una volta e ripetibile senza cuciture. */
export function biomeTexture(id: BiomeId): HTMLCanvasElement {
  return generateTexture(id, STYLES[id]);
}

export function pathTexture(id: PathTextureId): HTMLCanvasElement {
  return generateTexture(`path:${id}`, PATH_TEXTURES[id]);
}

export function roofTexture(style: RoofStyle): HTMLCanvasElement {
  return generateTexture(`roof:${style}`, ROOF_TEXTURES[style]);
}

function generateTexture(id: string, style: BiomeStyle): HTMLCanvasElement {
  const cached = textures.get(id);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d") as Ctx;
  const seed = hashString(id);
  const fbm = tileableFbm(seed, style.period, style.octaves);
  const image = ctx.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const scale = style.period / TEXTURE_SIZE;
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      let n = fbm(x * scale, y * scale);
      // Il rumore fBm si concentra attorno a 0,5: lo si allarga per avere più contrasto.
      n = Math.min(1, Math.max(0, (n - 0.5) * 2.2 + 0.5));
      if (style.ridged) n = (1 - Math.abs(2 * n - 1)) ** 3;
      const [r, g, b] = samplePalette(style.colors, n);
      const i = (y * TEXTURE_SIZE + x) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  style.detail?.(ctx, seededRandom(seed ^ 0x9e3779b9));
  textures.set(id, canvas);
  return canvas;
}

const patterns = new WeakMap<Ctx, Map<BiomeId, CanvasPattern>>();

/** Pattern del bioma per un contesto (i pattern appartengono al contesto che li crea). */
export function biomePattern(ctx: Ctx, id: BiomeId): CanvasPattern {
  let byBiome = patterns.get(ctx);
  if (!byBiome) {
    byBiome = new Map();
    patterns.set(ctx, byBiome);
  }
  let pattern = byBiome.get(id);
  if (!pattern) {
    pattern = ctx.createPattern(biomeTexture(id), "repeat") as CanvasPattern;
    byBiome.set(id, pattern);
  }
  return pattern;
}
