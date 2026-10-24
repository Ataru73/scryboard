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

const RECENT_PORTRAITS_KEY = "scryboard:recent-portraits";

export const storage = {
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
