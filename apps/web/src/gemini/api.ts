/**
 * Client minimo dell'API di Gemini per generare immagini dei token. La richiesta parte dal browser
 * con la chiave dell'utente, che non passa mai dal server di Scryboard.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";

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

const MESSAGES: Record<GeminiErrorCode, string> = {
  "invalid-key": "Chiave API non valida.",
  quota: "Quota di Gemini esaurita: riprova più tardi o controlla il tuo piano.",
  blocked:
    "Google ha rifiutato la richiesta (filtri di sicurezza): prova a cambiare la descrizione.",
  "not-found": "Modello non trovato: controlla il nome nelle impostazioni.",
  network: "Impossibile raggiungere Gemini. Controlla la connessione.",
  other: "Gemini ha risposto con un errore.",
};

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

function errorFromStatus(status: number, body: unknown): GeminiError {
  const err = (body as { error?: { message?: string; status?: string } } | null)?.error;
  const message = err?.message ?? "";
  if (status === 429 || err?.status === "RESOURCE_EXHAUSTED") {
    return new GeminiError("quota", MESSAGES.quota);
  }
  if (
    status === 401 ||
    status === 403 ||
    /api key not valid|API_KEY_INVALID|API key expired/i.test(message)
  ) {
    return new GeminiError("invalid-key", MESSAGES["invalid-key"]);
  }
  if (status === 404) return new GeminiError("not-found", MESSAGES["not-found"]);
  return new GeminiError("other", message ? `${MESSAGES.other} ${message}` : MESSAGES.other);
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
  if (res.promptFeedback?.blockReason) throw new GeminiError("blocked", MESSAGES.blocked);
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
  if (reason && reason !== "STOP") throw new GeminiError("blocked", MESSAGES.blocked);
  throw new GeminiError("other", "Gemini non ha restituito nessuna immagine.");
}

async function call(url: string, apiKey: string, init: RequestInit = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
    });
  } catch {
    throw new GeminiError("network", MESSAGES.network);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw errorFromStatus(res.status, body);
  return body;
}

/** Genera un'immagine quadrata; per più varianti si fanno più richieste (vedi `generateVariants`). */
export async function generateImage(opts: {
  apiKey: string;
  model: string;
  prompt: string;
}): Promise<GeneratedImage> {
  const body = await call(
    `${ENDPOINT}/models/${encodeURIComponent(opts.model)}:generateContent`,
    opts.apiKey,
    {
      method: "POST",
      body: JSON.stringify({
        contents: [{ parts: [{ text: opts.prompt }] }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1" } },
      }),
    },
  );
  return parseImages(body)[0] as GeneratedImage;
}

/** Fa `count` richieste in parallelo: ognuna è una variante, e una che fallisce non ferma le altre. */
export async function generateVariants(
  opts: { apiKey: string; model: string; prompt: string },
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

/** Controlla la chiave leggendo i dati del modello: non genera nulla, quindi non costa. */
export async function testKey(apiKey: string, model: string): Promise<void> {
  await call(`${ENDPOINT}/models/${encodeURIComponent(model)}`, apiKey);
}
