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
  getProfile: (): { name: string; color: string } | null => {
    const raw = read("scryboard:profile");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  setProfile: (profile: { name: string; color: string }) =>
    write("scryboard:profile", JSON.stringify(profile)),
};
