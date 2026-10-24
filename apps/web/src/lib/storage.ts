export interface Profile {
  /** Identifica l'autore degli oggetti creati da questo browser. */
  id: string;
  name: string;
  color: string;
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

export const storage = {
  getGmToken: (roomId: string) => read(`scryboard:gm:${roomId}`),
  setGmToken: (roomId: string, token: string | null) => write(`scryboard:gm:${roomId}`, token),
  getProfile: (): Profile | null => {
    const raw = read("scryboard:profile");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<Profile>;
      if (typeof parsed.name !== "string" || typeof parsed.color !== "string") return null;
      const profile = { id: parsed.id ?? newProfileId(), name: parsed.name, color: parsed.color };
      // I profili salvati prima della M1 non hanno un id: lo si aggiunge una volta sola.
      if (!parsed.id) write("scryboard:profile", JSON.stringify(profile));
      return profile;
    } catch {
      return null;
    }
  },
  setProfile: (profile: Profile) => write("scryboard:profile", JSON.stringify(profile)),
};
