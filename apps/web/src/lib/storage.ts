export interface CustomStamp {
  assetId: string;
  size: number;
  label?: string;
}

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
const DICE_PRESETS_KEY = "scryboard:dice-presets";
const DICE_SOUND_MUTED_KEY = "scryboard:dice-sound-muted";
const WEATHER_HIDDEN_KEY = "scryboard:weather-hidden";
const MAX_GENERATED = 24;
/** Quante formule si possono salvare: oltre, i pulsanti non starebbero più nel pannello. */
export const MAX_DICE_PRESETS = 12;

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
  /** Formule dei dadi salvate in questo browser (valgono per ogni stanza). */
  getDicePresets: (): string[] => {
    try {
      const saved: unknown = JSON.parse(read(DICE_PRESETS_KEY) ?? "[]");
      return Array.isArray(saved)
        ? saved
            .filter((f): f is string => typeof f === "string" && f.length > 0 && f.length <= 100)
            .slice(0, MAX_DICE_PRESETS)
        : [];
    } catch {
      return [];
    }
  },
  setDicePresets: (formulas: string[]) =>
    write(DICE_PRESETS_KEY, JSON.stringify(formulas.slice(0, MAX_DICE_PRESETS))),
  /** Disattiva l'effetto sonoro al lancio dei dadi per questo browser. */
  getDiceSoundMuted: () => read(DICE_SOUND_MUTED_KEY) === "1",
  setDiceSoundMuted: (muted: boolean) => write(DICE_SOUND_MUTED_KEY, muted ? "1" : null),
  /** Chi trova fastidioso il meteo animato lo spegne per sé, in tutte le stanze. */
  getWeatherHidden: () => read(WEATHER_HIDDEN_KEY) === "1",
  setWeatherHidden: (hidden: boolean) => write(WEATHER_HIDDEN_KEY, hidden ? "1" : null),
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
  /** Timbri personalizzati o generati dall'AI in questa stanza. */
  getCustomStamps: (roomId: string): CustomStamp[] => {
    try {
      const saved: unknown = JSON.parse(read(`scryboard:stamps:${roomId}`) ?? "[]");
      return Array.isArray(saved)
        ? saved.filter(
            (s): s is CustomStamp =>
              typeof s === "object" && s !== null && typeof (s as CustomStamp).assetId === "string",
          )
        : [];
    } catch {
      return [];
    }
  },
  addCustomStamp: (roomId: string, stamp: CustomStamp) => {
    const list = storage.getCustomStamps(roomId).filter((s) => s.assetId !== stamp.assetId);
    write(`scryboard:stamps:${roomId}`, JSON.stringify([stamp, ...list].slice(0, 32)));
  },
  removeCustomStamp: (roomId: string, assetId: string) => {
    const list = storage.getCustomStamps(roomId).filter((s) => s.assetId !== assetId);
    write(`scryboard:stamps:${roomId}`, JSON.stringify(list));
  },
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
  /**
   * Identità dello schermo condiviso, separata dal profilo: aperto nel browser del GM non deve
   * vedere attraverso i token del GM. Senza localStorage ne nasce una nuova a ogni apertura.
   */
  getProjectorIdentity: (): { id: string; secret: string } => {
    try {
      const parsed = JSON.parse(read("scryboard:projector") ?? "null") as {
        id?: unknown;
        secret?: unknown;
      } | null;
      if (typeof parsed?.id === "string" && typeof parsed.secret === "string") {
        return { id: parsed.id, secret: parsed.secret };
      }
    } catch {
      // Valore illeggibile: se ne crea uno nuovo.
    }
    const identity = { id: newProfileId(), secret: newProfileSecret() };
    write("scryboard:projector", JSON.stringify(identity));
    return identity;
  },
};
