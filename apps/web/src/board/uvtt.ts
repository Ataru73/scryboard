import { uvttSchema, type WallDraft } from "@scryboard/shared";
import type { Point } from "./viewport";

/**
 * Formato Universal VTT (`.uvtt`, `.dd2vtt` di Dungeondraft, `.df2vtt` di DungeonFog): un JSON
 * con l'immagine della mappa in base64, la griglia, i muri (`line_of_sight`), le porte
 * (`portals`) e le luci. Le coordinate sono in caselle, a partire da `map_origin`.
 */
export const UVTT_EXTENSIONS = [".uvtt", ".dd2vtt", ".df2vtt"];

export function isUvttFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return UVTT_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export interface UvttLight {
  /** Posizione in caselle dall'angolo della mappa. */
  x: number;
  y: number;
  /** Raggio in caselle. */
  range: number;
  color: string;
}

export interface UvttMap {
  image: File;
  /** Dimensioni in caselle. */
  cols: number;
  rows: number;
  /** Muri e porte in caselle dall'angolo della mappa. */
  walls: Point[][];
  doors: { points: [Point, Point]; open: boolean }[];
  lights: UvttLight[];
}

export class UvttError extends Error {}

const IMAGE_SIGNATURES: { type: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { type: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 },
  { type: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 },
  {
    type: "image/webp",
    ext: "webp",
    test: (b) => String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  },
];

function decodeImage(base64: string, name: string): File {
  const data = base64.replace(/^data:[^,]*,/, "").replace(/\s/g, "");
  let binary: string;
  try {
    binary = atob(data);
  } catch {
    throw new UvttError("immagine non valida");
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const format = IMAGE_SIGNATURES.find((s) => s.test(bytes));
  if (!format) throw new UvttError("formato dell'immagine non supportato");
  const base = name.replace(/\.[^.]+$/, "") || "mappa";
  return new File([bytes], `${base}.${format.ext}`, { type: format.type });
}

/** Colore delle luci: UVTT usa "AARRGGBB" (o "RRGGBB"); se manca, una luce calda. */
export function uvttColor(color: string | undefined): string {
  const hex = color?.replace(/^#/, "") ?? "";
  const rgb = hex.length === 8 ? hex.slice(2) : hex;
  return /^[0-9a-f]{6}$/i.test(rgb) ? `#${rgb.toLowerCase()}` : "#ffe2a8";
}

/** Legge un file UVTT già decodificato da JSON; `name` dà il nome all'immagine. */
export function parseUvtt(json: unknown, name: string): UvttMap {
  const parsed = uvttSchema.safeParse(json);
  if (!parsed.success) throw new UvttError("file UVTT non valido");
  const { resolution, image } = parsed.data;
  const origin = resolution.map_origin;
  const local = (p: Point): Point => ({ x: p.x - origin.x, y: p.y - origin.y });
  const walls = [...(parsed.data.line_of_sight ?? []), ...(parsed.data.objects_line_of_sight ?? [])]
    .map((line) => line.map(local))
    .filter((line) => line.length >= 2);
  const doors = (parsed.data.portals ?? []).map((portal) => ({
    points: [local(portal.bounds[0] as Point), local(portal.bounds.at(-1) as Point)] as [
      Point,
      Point,
    ],
    open: portal.closed === false,
  }));
  const lights = (parsed.data.lights ?? []).map((light) => ({
    ...local(light.position),
    range: light.range,
    color: uvttColor(light.color),
  }));
  return {
    image: decodeImage(image, name),
    cols: resolution.map_size.x,
    rows: resolution.map_size.y,
    walls,
    doors,
    lights,
  };
}

/** I muri molto lunghi si spezzano: lo schema ne limita i punti. */
const MAX_WALL_VERTICES = 5000;

/**
 * Muri, porte e luci della mappa piazzata con l'angolo in `origin` e caselle di `cell` pixel.
 * Le luci illuminano piene per metà del raggio e fioche fino in fondo.
 */
export function uvttToBoard(map: UvttMap, origin: Point, cell: number) {
  const world = (p: Point) => [origin.x + p.x * cell, origin.y + p.y * cell];
  const walls: WallDraft[] = [];
  for (const line of map.walls) {
    for (let start = 0; start < line.length - 1; start += MAX_WALL_VERTICES - 1) {
      const chunk = line.slice(start, start + MAX_WALL_VERTICES);
      walls.push({ kind: "wall", points: chunk.flatMap(world) });
    }
  }
  for (const door of map.doors) {
    walls.push({
      kind: "door",
      points: door.points.flatMap(world),
      door: door.open ? "open" : "closed",
    });
  }
  const lights = map.lights.map((light) => ({
    x: origin.x + light.x * cell,
    y: origin.y + light.y * cell,
    bright: Math.min(100, light.range / 2),
    dim: Math.min(100, light.range),
    color: light.color,
  }));
  return { walls, lights, width: map.cols * cell, height: map.rows * cell };
}
