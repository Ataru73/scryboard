export interface Profile {
  /** Identifica l'autore degli oggetti creati da questo browser. */
  id: string;
  name: string;
  color: string;
  /**
   * Segreto del profilo: dimostra al server che i messaggi privati sono davvero di questo
   * browser (l'id invece è visibile a tutti). Non si condivide mai.
   */
  secret: string;
}

export function newProfileSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function newProfileId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// localStorage può non essere disponibile (navigazione privata, cookie bloccati).
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Ignorato: il dato resta solo per questa sessione.
  }
}

const LANGUAGE_KEY = "scryboard:language";
const RECENT_PORTRAITS_KEY = "scryboard:recent-portraits";
const GEMINI_KEY = "scryboard:gemini-key";
const GEMINI_MODEL_KEY = "scryboard:gemini-model";
const GEMINI_VISION_MODEL_KEY = "scryboard:gemini-vision-model";
const MAX_GENERATED = 24;

const geminiKeyListeners = new Set<() => void>();

/** Per useSyncExternalStore: avvisa quando la chiave cambia, anche da un'altra scheda. */
export function subscribeGeminiKey(listener: () => void): () => void {
  geminiKeyListeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === GEMINI_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    geminiKeyListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const storage = {
  getLanguage: () => read(LANGUAGE_KEY),
  setLanguage: (language: string) => write(LANGUAGE_KEY, language),
  /** Chiave API di Gemini: resta in questo browser, non si invia mai al server di Scryboard. */
  getGeminiKey: () => read(GEMINI_KEY),
  setGeminiKey: (key: string | null) => {
    write(GEMINI_KEY, key?.trim() || null);
    for (const listener of geminiKeyListeners) listener();
  },
  /** Modello che legge le immagini (per tracciare i muri); diverso da quello che le genera. */
  getGeminiVisionModel: () => read(GEMINI_VISION_MODEL_KEY),
  setGeminiVisionModel: (model: string | null) =>
    write(GEMINI_VISION_MODEL_KEY, model?.trim() || null),
  getGeminiModel: () => read(GEMINI_MODEL_KEY),
  setGeminiModel: (model: string | null) => write(GEMINI_MODEL_KEY, model?.trim() || null),
  /** Immagini generate in questa stanza (id degli asset caricati), le più recenti per prime. */
  getGenerated: (roomId: string): string[] => {
    try {
      const saved: unknown = JSON.parse(read(`scryboard:generated:${roomId}`) ?? "[]");
      return Array.isArray(saved) ? saved.filter((id) => typeof id === "string") : [];
    } catch {
      return [];
    }
  },
  addGenerated: (roomId: string, assetId: string) =>
    write(
      `scryboard:generated:${roomId}`,
      JSON.stringify(
        [assetId, ...storage.getGenerated(roomId).filter((a) => a !== assetId)].slice(
          0,
          MAX_GENERATED,
        ),
      ),
    ),
  getRecentPortraits: (): string[] => {
    try {
      const saved: unknown = JSON.parse(read(RECENT_PORTRAITS_KEY) ?? "[]");
      return Array.isArray(saved) ? saved.filter((id) => typeof id === "string").slice(0, 8) : [];
    } catch {
      return [];
    }
  },
  /** Mette l'immagine in testa ai recenti (al massimo 8, senza doppioni). */
  addRecentPortrait: (id: string) =>
    write(
      RECENT_PORTRAITS_KEY,
      JSON.stringify([id, ...storage.getRecentPortraits().filter((r) => r !== id)].slice(0, 8)),
    ),
  getGmToken: (roomId: string) => read(`scryboard:gm:${roomId}`),
  setGmToken: (roomId: string, token: string | null) => write(`scryboard:gm:${roomId}`, token),
  getProfile: (): Profile | null => {
    const raw = read("scryboard:profile");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<Profile>;
      if (typeof parsed.name !== "string" || typeof parsed.color !== "string") return null;
      const profile = {
        id: parsed.id ?? newProfileId(),
        name: parsed.name,
        color: parsed.color,
        secret: parsed.secret ?? newProfileSecret(),
      };
      // I profili salvati prima non hanno id o segreto: li si aggiunge una volta sola.
      if (!parsed.id || !parsed.secret) write("scryboard:profile", JSON.stringify(profile));
      return profile;
    } catch {
      return null;
    }
  },
  setProfile: (profile: Profile) => write("scryboard:profile", JSON.stringify(profile)),
};
