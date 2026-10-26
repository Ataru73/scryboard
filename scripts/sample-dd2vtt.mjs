// Genera e2e/fixtures/sample.dd2vtt: una mappa Universal VTT di prova, scritta da noi (nessuna
// licenza di terzi). Due stanze di una locanda con muri, una colonna, una porta interna chiusa,
// l'ingresso aperto e due luci; colori ARGB come li esporta Dungeondraft.
// Uso: node scripts/sample-dd2vtt.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "e2e/fixtures/sample.dd2vtt");

const COLS = 8;
const ROWS = 6;
const PPG = 50;

// Muri in caselle: il perimetro aperto sull'ingresso (in basso) e la parete tra le due stanze,
// interrotta dalla porta.
const walls = [
  [
    [4.5, 5],
    [7, 5],
    [7, 1],
    [1, 1],
    [1, 5],
    [3.5, 5],
  ],
  [
    [4, 1],
    [4, 2.5],
  ],
  [
    [4, 3.5],
    [4, 5],
  ],
];
const pillar = [
  [2, 2],
  [2.5, 2],
  [2.5, 2.5],
  [2, 2.5],
  [2, 2],
];
const doors = [
  {
    bounds: [
      [4, 2.5],
      [4, 3.5],
    ],
    closed: true,
  },
  {
    bounds: [
      [3.5, 5],
      [4.5, 5],
    ],
    closed: false,
  },
];
const lights = [
  { position: [2.5, 3.5], range: 4, intensity: 1, color: "ffffb35c" },
  { position: [5.5, 3], range: 3, intensity: 0.8, color: "ffa8c8ff" },
];

// --- Immagine: pavimento di legno nelle stanze, erba fuori, muri scuri ---
const width = COLS * PPG;
const height = ROWS * PPG;
const pixels = Buffer.alloc(width * height * 3);

function fill(x0, y0, x1, y1, [r, g, b]) {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(height, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(width, Math.ceil(x1)); x++) {
      const i = (y * width + x) * 3;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
    }
  }
}

// Erba con un po' di variazione deterministica.
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const n = ((x * 7 + y * 13) ^ (x * y)) % 9;
    fill(x, y, x + 1, y + 1, [86 + n * 2, 120 + n * 2, 64 + n]);
  }
}
// Assi del pavimento: file orizzontali alte un quarto di casella.
for (let y = PPG; y < 5 * PPG; y++) {
  const plank = Math.floor((y - PPG) / (PPG / 4));
  const shade = plank % 2 === 0 ? 0 : 10;
  fill(PPG, y, 7 * PPG, y + 1, [150 - shade, 110 - shade, 70 - shade]);
  if ((y - PPG) % (PPG / 4) === 0) fill(PPG, y, 7 * PPG, y + 1, [110, 78, 48]);
}
const WALL = [52, 44, 40];
const thickness = 6;
function line([ax, ay], [bx, by], color, t = thickness) {
  const [x0, x1] = [Math.min(ax, bx) * PPG, Math.max(ax, bx) * PPG];
  const [y0, y1] = [Math.min(ay, by) * PPG, Math.max(ay, by) * PPG];
  fill(x0 - t / 2, y0 - t / 2, x1 + t / 2, y1 + t / 2, color);
}
for (const wall of walls) for (let i = 1; i < wall.length; i++) line(wall[i - 1], wall[i], WALL);
fill(2 * PPG, 2 * PPG, 2.5 * PPG, 2.5 * PPG, [120, 116, 110]);
for (let i = 1; i < pillar.length; i++) line(pillar[i - 1], pillar[i], WALL, 3);
for (const door of doors) line(door.bounds[0], door.bounds[1], [170, 110, 50], 4);

// --- PNG minimale (RGB, senza filtri) ---
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0);
header.writeUInt32BE(height, 4);
header[8] = 8; // bit per canale
header[9] = 2; // RGB
const rows = Buffer.alloc((width * 3 + 1) * height);
for (let y = 0; y < height; y++) {
  pixels.copy(rows, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(rows, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

// --- File Universal VTT ---
const point = ([x, y]) => ({ x, y });
const map = {
  format: 0.3,
  resolution: {
    map_origin: { x: 0, y: 0 },
    map_size: { x: COLS, y: ROWS },
    pixels_per_grid: PPG,
  },
  line_of_sight: walls.map((wall) => wall.map(point)),
  objects_line_of_sight: [pillar.map(point)],
  portals: doors.map(({ bounds, closed }) => {
    const [a, b] = bounds;
    return {
      position: point([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]),
      bounds: bounds.map(point),
      rotation: a[0] === b[0] ? Math.PI / 2 : 0,
      closed,
      freestanding: false,
    };
  }),
  environment: { baked_lighting: false, ambient_light: "ffffffff" },
  lights: lights.map(({ position, ...light }) => ({
    position: point(position),
    ...light,
    shadows: true,
  })),
  image: png.toString("base64"),
};
writeFileSync(target, `${JSON.stringify(map, null, 1)}\n`);
console.log(`${target}: ${width}×${height} px, ${(png.length / 1024).toFixed(1)} KB di immagine`);
