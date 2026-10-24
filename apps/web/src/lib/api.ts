import type { CreateRoomResponse, RoomInfo } from "@scryboard/shared";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiRequestError(0);
  }
  if (!res.ok) throw new ApiRequestError(res.status);
  return (await res.json()) as T;
}

/** `status` è 0 quando la richiesta non è proprio arrivata (rete assente, server spento). */
export class ApiRequestError extends Error {
  constructor(readonly status: number) {
    super(`Richiesta fallita (${status})`);
  }
}

/** Messaggio da mostrare all'utente per un errore delle API. */
export function describeApiError(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return "Si è verificato un errore imprevisto. Riprova.";
  // 502/503/504 arrivano dal proxy (Vite in sviluppo) quando il server non risponde.
  if (error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504) {
    return "Il server di Scryboard non risponde. Controlla che sia avviato e riprova.";
  }
  if (error.status === 400) return "Dati non validi: controlla quello che hai inserito.";
  return `Il server ha risposto con un errore (${error.status}). Riprova.`;
}

export const api = {
  createRoom: (name: string) =>
    request<CreateRoomResponse>("/rooms", { method: "POST", body: JSON.stringify({ name }) }),
  getRoom: (id: string) => request<RoomInfo>(`/rooms/${encodeURIComponent(id)}`),
  checkGmToken: (id: string, token: string) =>
    request<{ valid: boolean }>(`/rooms/${encodeURIComponent(id)}/gm-check`, {
      method: "POST",
      body: JSON.stringify({ token }),
    }).then((r) => r.valid),
};
