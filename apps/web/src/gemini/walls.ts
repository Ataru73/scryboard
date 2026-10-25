import { call, ENDPOINT, GeminiError } from "./api";

/** Ultima scelta se l'elenco dei modelli non è disponibile: modificabile nelle impostazioni. */
export const DEFAULT_VISION_MODEL = "gemini-2.5-flash";

/**
 * Sceglie da solo il modello migliore tra quelli che leggono le immagini: il "flash" più recente
 * (i nomi cambiano spesso, un nome fisso prima o poi non esiste più). Senza candidati, il default.
 */
export function pickDefaultVisionModel(models: { id: string }[]): string {
  const version = (id: string) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(id)?.[1] ?? 0);
  const flash = models
    .map((m) => m.id)
    .filter((id) => /flash/i.test(id) && !/lite|preview|exp/i.test(id));
  const pool = flash.length > 0 ? flash : models.map((m) => m.id);
  return (
    pool.sort((a, b) => version(b) - version(a) || a.localeCompare(b))[0] ?? DEFAULT_VISION_MODEL
  );
}

/** Lato lungo massimo dell'immagine inviata: più grande costa di più senza migliorare i muri. */
const ANALYSIS_MAX_SIDE = 1536;
/** Gemini restituisce le coordinate su una scala 0–1000 rispetto all'immagine. */
export const TRACE_SCALE = 1000;
const MAX_TRACED_WALLS = 300;

export interface TracedWall {
  kind: "wall" | "door" | "window";
  /** Vertici su scala 0–1000: x da sinistra, y dall'alto. */
  points: { x: number; y: number }[];
}

export const WALL_TRACE_PROMPT = [
  "This is a top-down battle map for a tabletop RPG. Trace the walls a player could not walk or see through.",
  "Return polylines that follow the centre line of each wall, with a vertex at every corner and as few vertices as possible.",
  "Trace doors as kind 'door' with exactly two points (the two ends of the door), windows as kind 'window', everything else as kind 'wall'.",
  "Include the outer boundary of rooms and caves. Do not trace furniture, decorations, props, floor patterns, water or grid lines.",
  `Coordinates are integers from 0 to ${TRACE_SCALE}: x from the left edge, y from the top edge of the image.`,
].join(" ");

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    walls: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          kind: { type: "STRING", enum: ["wall", "door", "window"] },
          points: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { x: { type: "INTEGER" }, y: { type: "INTEGER" } },
              required: ["x", "y"],
            },
          },
        },
        required: ["kind", "points"],
      },
    },
  },
  required: ["walls"],
};

/** Legge il JSON restituito da Gemini scartando muri malformati o troppo corti. */
export function parseWallTrace(json: unknown): TracedWall[] {
  const res = json as {
    promptFeedback?: { blockReason?: string };
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null;
  if (res?.promptFeedback?.blockReason) {
    throw new GeminiError("blocked", "Google ha rifiutato la richiesta (filtri di sicurezza).");
  }
  const text = res?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
  if (!text) throw new GeminiError("other", "Gemini non ha restituito nessun muro.");
  let parsed: { walls?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeminiError("other", "La risposta di Gemini non è leggibile.");
  }
  const clamp = (n: number) => Math.max(0, Math.min(TRACE_SCALE, n));
  const walls: TracedWall[] = [];
  for (const raw of Array.isArray(parsed.walls) ? parsed.walls : []) {
    const kind = raw?.kind === "door" || raw?.kind === "window" ? raw.kind : "wall";
    const points: TracedWall["points"] = (Array.isArray(raw?.points) ? raw.points : [])
      .filter((p: { x?: unknown; y?: unknown }) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
      .map((p: { x: number; y: number }) => ({ x: clamp(p.x), y: clamp(p.y) }));
    if (points.length >= 2) walls.push({ kind, points });
    if (walls.length >= MAX_TRACED_WALLS) break;
  }
  return walls;
}

/** Primo fotogramma di un video (WebM o MP4) come immagine. */
async function firstFrame(blob: Blob): Promise<ImageBitmap> {
  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Impossibile leggere il video."));
    });
    return await createImageBitmap(video);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Riduce l'immagine e la codifica in JPEG base64, pronta da inviare a Gemini. */
export async function prepareForAnalysis(blob: Blob): Promise<{ mimeType: string; data: string }> {
  // Per una mappa animata si analizza il primo fotogramma.
  const bitmap = blob.type.startsWith("video/")
    ? await firstFrame(blob)
    : await createImageBitmap(blob);
  const scale = Math.min(1, ANALYSIS_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const jpeg = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  );
  if (!jpeg) throw new Error("Impossibile preparare l'immagine.");
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return { mimeType: "image/jpeg", data: btoa(binary) };
}

/** Chiede a Gemini di tracciare i muri di una mappa vista dall'alto. */
export async function traceWalls(opts: {
  apiKey: string;
  model: string;
  image: { mimeType: string; data: string };
}): Promise<TracedWall[]> {
  const body = await call(
    `${ENDPOINT}/models/${encodeURIComponent(opts.model)}:generateContent`,
    opts.apiKey,
    {
      method: "POST",
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inlineData: { mimeType: opts.image.mimeType, data: opts.image.data } },
              { text: WALL_TRACE_PROMPT },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.2,
        },
      }),
    },
  );
  return parseWallTrace(body);
}
