/**
 * Client minimo dell'API di Gemini per generare immagini dei token. La richiesta parte dal browser
 * con la chiave dell'utente, che non passa mai dal server di Scryboard.
 */

import i18n from "../i18n";

/** Una generazione di immagini può durare a lungo, ma non all'infinito. */
const REQUEST_TIMEOUT_MS = 180_000;

export const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";

/** Modello predefinito: modificabile nelle impostazioni, perché i nomi cambiano spesso. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-image";

export const GEMINI_STYLES = [
  {
    id: "bust",
    label: "Ritratto a mezzo busto",
    template: "Fantasy character portrait, head and shoulders, painterly illustration:",
  },
  {
    id: "top",
    label: "Vista dall'alto",
    template: "Top-down view of a fantasy miniature seen from above, tabletop game token art:",
  },
  {
    id: "silhouette",
    label: "Sagoma",
    template:
      "Bold white silhouette icon on a flat dark background, simple shapes, game-icons style:",
  },
] as const;
export type GeminiStyleId = (typeof GEMINI_STYLES)[number]["id"];

export const MAP_STYLES = [
  {
    id: "dungeon",
    label: "Dungeon o interno",
    template: "Top-down battle map of a dungeon or building interior for a fantasy tabletop RPG:",
  },
  {
    id: "outdoor",
    label: "Esterno o natura",
    template: "Top-down battle map of an outdoor location for a fantasy tabletop RPG:",
  },
  {
    id: "region",
    label: "Mappa di una regione",
    template: "Illustrated fantasy region map on aged parchment, cartographer style:",
  },
] as const;
export type MapStyleId = (typeof MAP_STYLES)[number]["id"];

export const STAMP_STYLES = [
  {
    id: "prop",
    label: "Oggetto o arredo",
    template:
      "Top-down orthographic view of a fantasy tabletop RPG battle map prop or furniture, seen directly from above:",
  },
  {
    id: "nature",
    label: "Natura o vegetazione",
    template:
      "Top-down orthographic view of a fantasy tabletop battle map nature element, tree, plant, rock, or terrain feature, seen directly from above:",
  },
  {
    id: "structure",
    label: "Struttura o rovina",
    template:
      "Top-down orthographic view of an architectural element, ruin, statue, altar, or structure for a fantasy tabletop battle map, seen directly from above:",
  },
  {
    id: "magic",
    label: "Effetto magico o runa",
    template:
      "Top-down orthographic view of a magical circle, rune, portal, crystal, or arcane element for a fantasy tabletop battle map, seen directly from above:",
  },
] as const;
export type StampStyleId = (typeof STAMP_STYLES)[number]["id"];

export const MAP_FORMATS = [
  { id: "16:9", label: "Orizzontale (16:9)" },
  { id: "4:3", label: "Orizzontale (4:3)" },
  { id: "1:1", label: "Quadrata" },
  { id: "3:4", label: "Verticale (3:4)" },
] as const;
export type MapFormatId = (typeof MAP_FORMATS)[number]["id"];

export type GeminiErrorCode =
  | "invalid-key"
  | "quota"
  | "blocked"
  | "not-found"
  | "network"
  | "other";

export class GeminiError extends Error {
  constructor(
    readonly code: GeminiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function errorMessage(code: GeminiErrorCode): string {
  return i18n.t(`assets.gemini.errors.${code}`);
}

export interface GeneratedImage {
  mimeType: string;
  /** Immagine in base64. */
  data: string;
}

/** Unisce la descrizione dell'utente a un modello fisso adatto al ritaglio circolare del token. */
export function buildPrompt(description: string, style: GeminiStyleId): string {
  const template = GEMINI_STYLES.find((s) => s.id === style)?.template ?? GEMINI_STYLES[0].template;
  return [
    `${template} ${description.trim()}.`,
    "Single subject, centered, filling most of a square frame, plain uniform background,",
    "no text, no letters, no border, no frame, suitable for cropping into a circle.",
  ].join(" ");
}

/** Descrizione della mappa più le regole che la rendono usabile sulla lavagna. */
export function buildMapPrompt(description: string, style: MapStyleId): string {
  const template = MAP_STYLES.find((s) => s.id === style)?.template ?? MAP_STYLES[0].template;
  return [
    `${template} ${description.trim()}.`,
    style === "region"
      ? "Seen from above, no text, no letters, no labels, no border, no frame."
      : "Orthographic view from directly above, evenly lit, no grid lines, no characters, no creatures, no tokens, no text, no letters, no border, no frame.",
    "The image fills the whole canvas edge to edge.",
  ].join(" ");
}

/** Descrizione del timbro/oggetto di scenario isolato, visto dall'alto su sfondo bianco uniforme. */
export function buildStampPrompt(description: string, style: StampStyleId): string {
  const template = STAMP_STYLES.find((s) => s.id === style)?.template ?? STAMP_STYLES[0].template;
  return [
    `${template} ${description.trim()}.`,
    "Single isolated subject, centered, tabletop battle map asset or stamp, seen directly from above,",
    "isolated on a plain solid white background, no ground texture, no shadow clipping, no floor, no characters, no creatures, no tokens, no text, no letters, no border, no frame.",
  ].join(" ");
}

function errorFromStatus(status: number, body: unknown): GeminiError {
  const err = (body as { error?: { message?: string; status?: string } } | null)?.error;
  const message = err?.message ?? "";
  if (status === 429 || err?.status === "RESOURCE_EXHAUSTED") {
    return new GeminiError("quota", errorMessage("quota"));
  }
  if (
    status === 401 ||
    status === 403 ||
    /api key not valid|API_KEY_INVALID|API key expired/i.test(message)
  ) {
    return new GeminiError("invalid-key", errorMessage("invalid-key"));
  }
  if (status === 404) return new GeminiError("not-found", errorMessage("not-found"));
  const other = errorMessage("other");
  return new GeminiError("other", message ? `${other} ${message}` : other);
}

interface GenerateContentResponse {
  promptFeedback?: { blockReason?: string };
  candidates?: {
    finishReason?: string;
    content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] };
  }[];
}

/** Estrae le immagini dalla risposta di `generateContent`; rifiuti e risposte vuote sono errori. */
export function parseImages(json: unknown): GeneratedImage[] {
  const res = (json ?? {}) as GenerateContentResponse;
  if (res.promptFeedback?.blockReason) {
    throw new GeminiError("blocked", errorMessage("blocked"));
  }
  const images: GeneratedImage[] = [];
  for (const candidate of res.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const inline = part.inlineData;
      if (inline?.data && inline.mimeType?.startsWith("image/")) {
        images.push({ mimeType: inline.mimeType, data: inline.data });
      }
    }
  }
  if (images.length > 0) return images;
  const reason = res.candidates?.[0]?.finishReason;
  if (reason && reason !== "STOP") throw new GeminiError("blocked", errorMessage("blocked"));
  throw new GeminiError("other", i18n.t("assets.gemini.errors.noImages"));
}

export async function call(url: string, apiKey: string, init: RequestInit = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      // Senza limite una richiesta che non risponde terrebbe l'interfaccia in attesa per sempre.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...init,
      headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
    });
  } catch {
    throw new GeminiError("network", errorMessage("network"));
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw errorFromStatus(res.status, body);
  return body;
}

export interface GenerateOptions {
  apiKey: string;
  model: string;
  prompt: string;
  /** Proporzioni dell'immagine, per esempio "16:9". Default: quadrata. */
  aspectRatio?: string;
}

/** Genera un'immagine; per più varianti si fanno più richieste (vedi `generateVariants`). */
export async function generateImage(opts: GenerateOptions): Promise<GeneratedImage> {
  const body = await call(
    `${ENDPOINT}/models/${encodeURIComponent(opts.model)}:generateContent`,
    opts.apiKey,
    {
      method: "POST",
      body: JSON.stringify({
        contents: [{ parts: [{ text: opts.prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: opts.aspectRatio ?? "1:1" },
        },
      }),
    },
  );
  return parseImages(body)[0] as GeneratedImage;
}

/** Fa `count` richieste in parallelo: ognuna è una variante, e una che fallisce non ferma le altre. */
export async function generateVariants(
  opts: GenerateOptions,
  count: number,
): Promise<GeneratedImage[]> {
  const results = await Promise.allSettled(
    Array.from({ length: count }, () => generateImage(opts)),
  );
  const images = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (images.length > 0) return images;
  const first = results.find((r) => r.status === "rejected");
  throw (first as PromiseRejectedResult).reason;
}

export interface GeminiModel {
  /** Id da usare nell'URL (senza il prefisso `models/`). */
  id: string;
  displayName: string;
}

interface ModelsResponse {
  models?: { name?: string; displayName?: string; supportedGenerationMethods?: string[] }[];
  nextPageToken?: string;
}

/**
 * L'elenco dei modelli non dice cosa producono: si tengono quelli che rispondono a
 * `generateContent` e hanno nel nome "image" o "nano-banana" (Imagen usa un altro metodo).
 */
export function pickImageModels(json: unknown): GeminiModel[] {
  const res = (json ?? {}) as ModelsResponse;
  return (res.models ?? []).flatMap((m) => {
    const id = m.name?.replace(/^models\//, "");
    if (!id || !m.supportedGenerationMethods?.includes("generateContent")) return [];
    if (!/image|nano-banana/i.test(id)) return [];
    return [{ id, displayName: m.displayName || id }];
  });
}

/**
 * Modelli che leggono le immagini e rispondono con testo (servono a tracciare i muri): quelli
 * `gemini-*` con `generateContent`, esclusi i modelli che producono immagini o audio e gli altri
 * usi specializzati.
 */
export function pickVisionModels(json: unknown): GeminiModel[] {
  const res = (json ?? {}) as ModelsResponse;
  return (res.models ?? []).flatMap((m) => {
    const id = m.name?.replace(/^models\//, "");
    if (!id?.startsWith("gemini") || !m.supportedGenerationMethods?.includes("generateContent")) {
      return [];
    }
    if (/image|nano-banana|tts|live|audio|embedding|robotics|computer-use/i.test(id)) return [];
    return [{ id, displayName: m.displayName || id }];
  });
}

/**
 * Modelli disponibili con la chiave, divisi per uso. Serve anche a controllare la chiave: non
 * genera nulla, quindi non costa.
 */
export async function listGeminiModels(
  apiKey: string,
): Promise<{ image: GeminiModel[]; vision: GeminiModel[] }> {
  const image: GeminiModel[] = [];
  const vision: GeminiModel[] = [];
  let pageToken = "";
  // Poche pagine bastano: il limite evita cicli infiniti con risposte anomale.
  for (let page = 0; page < 10; page++) {
    const query = `pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const body = (await call(`${ENDPOINT}/models?${query}`, apiKey)) as ModelsResponse | null;
    image.push(...pickImageModels(body));
    vision.push(...pickVisionModels(body));
    pageToken = body?.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return { image, vision };
}

/** Elenco dei modelli per immagini disponibili con la chiave. */
export async function listImageModels(apiKey: string): Promise<GeminiModel[]> {
  return (await listGeminiModels(apiKey)).image;
}
