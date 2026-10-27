import type {
  CreateRoomResponse,
  ListAssetsResponse,
  Roll,
  RollRequest,
  RoomInfo,
  Scene,
  ScenesResponse,
  SendMessageRequest,
  UploadAssetResponse,
} from "@scryboard/shared";
import { i18n } from "../i18n";

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
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    throw new ApiRequestError(res.status, typeof body?.error === "string" ? body.error : undefined);
  }
  return (await res.json()) as T;
}

/** `status` è 0 quando la richiesta non è proprio arrivata (rete assente, server spento). */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    /** Spiegazione del server, utile quando riguarda ciò che l'utente ha scritto. */
    readonly detail?: string,
  ) {
    super(i18n.t("core.api.requestFailed", { status }));
  }
}

/** Messaggio da mostrare all'utente per un errore delle API. */
export function describeApiError(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return i18n.t("core.api.unexpected");
  // 502/503/504 arrivano dal proxy (Vite in sviluppo) quando il server non risponde.
  if (error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504) {
    return i18n.t("core.api.unreachable");
  }
  if (error.status === 400 && error.detail) return error.detail;
  if (error.status === 400) return i18n.t("core.api.invalidData");
  if (error.status === 413) return error.detail ?? i18n.t("core.api.fileTooLarge");
  if (error.status === 415) return i18n.t("core.api.unsupportedFormat");
  return i18n.t("core.api.serverError", { status: error.status });
}

const gmHeaders = (gmToken: string) => ({ authorization: `Bearer ${gmToken}` });

export const api = {
  /** Scene della stanza (solo GM). */
  scenes: {
    list: (roomId: string, gmToken: string) =>
      request<ScenesResponse>(`/rooms/${encodeURIComponent(roomId)}/scenes`, {
        headers: gmHeaders(gmToken),
      }),
    create: (roomId: string, gmToken: string, name: string) =>
      request<Scene>(`/rooms/${encodeURIComponent(roomId)}/scenes`, {
        method: "POST",
        body: JSON.stringify({ name }),
        headers: gmHeaders(gmToken),
      }),
    rename: (roomId: string, gmToken: string, sceneId: string, name: string) =>
      request<{ ok: true }>(`/rooms/${encodeURIComponent(roomId)}/scenes/${sceneId}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
        headers: gmHeaders(gmToken),
      }),
    remove: (roomId: string, gmToken: string, sceneId: string) =>
      request<{ ok: true }>(`/rooms/${encodeURIComponent(roomId)}/scenes/${sceneId}`, {
        method: "DELETE",
        headers: gmHeaders(gmToken),
      }),
    duplicate: (roomId: string, gmToken: string, sceneId: string, name: string) =>
      request<Scene>(`/rooms/${encodeURIComponent(roomId)}/scenes/${sceneId}/duplicate`, {
        method: "POST",
        body: JSON.stringify({ name }),
        headers: gmHeaders(gmToken),
      }),
    /** Sposta i giocatori nella scena. */
    activate: (roomId: string, gmToken: string, sceneId: string) =>
      request<{ ok: true }>(`/rooms/${encodeURIComponent(roomId)}/scenes/${sceneId}/activate`, {
        method: "POST",
        headers: gmHeaders(gmToken),
      }),
  },
  createRoom: (name: string) =>
    request<CreateRoomResponse>("/rooms", { method: "POST", body: JSON.stringify({ name }) }),
  /** Crea una stanza nuova da un archivio .scryboard: restituisce i suoi link. */
  importRoom: (file: Blob) =>
    request<CreateRoomResponse>("/rooms/import", {
      method: "POST",
      body: file,
      headers: { "content-type": "application/octet-stream" },
    }),
  /** Archivio della stanza (solo GM): scene, oggetti nascosti e immagini. */
  exportRoom: async (roomId: string, gmToken: string): Promise<Blob> => {
    let res: Response;
    try {
      res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/export`, {
        headers: gmHeaders(gmToken),
      });
    } catch {
      throw new ApiRequestError(0);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      throw new ApiRequestError(
        res.status,
        typeof body?.error === "string" ? body.error : undefined,
      );
    }
    return res.blob();
  },
  getRoom: (id: string) => request<RoomInfo>(`/rooms/${encodeURIComponent(id)}`),
  checkGmToken: (id: string, token: string) =>
    request<{ valid: boolean }>(`/rooms/${encodeURIComponent(id)}/gm-check`, {
      method: "POST",
      body: JSON.stringify({ token }),
    }).then((r) => r.valid),
  /** Messaggio privato: il GM firma con il suo token, i giocatori con id e segreto del profilo. */
  sendMessage: (
    roomId: string,
    body: SendMessageRequest,
    auth: { gmToken: string } | { credentials: string },
  ) =>
    request<{ id: string }>(`/rooms/${encodeURIComponent(roomId)}/messages`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        authorization: "gmToken" in auth ? `Bearer ${auth.gmToken}` : `Player ${auth.credentials}`,
      },
    }),
  /** Tiro di dadi: lo fa il server; `hidden` (solo GM) non lo condivide con gli altri. */
  roll: (roomId: string, body: RollRequest, auth: { gmToken: string } | { credentials: string }) =>
    request<Roll>(`/rooms/${encodeURIComponent(roomId)}/rolls`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        authorization: "gmToken" in auth ? `Bearer ${auth.gmToken}` : `Player ${auth.credentials}`,
      },
    }),
  /** Immagini della stanza: il GM (con il token) le vede tutte, gli altri solo le pubbliche. */
  listAssets: (roomId: string, gmToken: string | null) =>
    request<ListAssetsResponse>(`/rooms/${encodeURIComponent(roomId)}/assets`, {
      headers: gmToken ? gmHeaders(gmToken) : {},
    }),
  /** Con il token del GM l'immagine resta privata finché un oggetto che la usa non è visibile. */
  uploadAsset: (roomId: string, file: Blob, auth: string | null = null) => {
    let authorization: string | undefined;
    if (auth) {
      authorization = auth.includes(":") ? `Player ${auth}` : `Bearer ${auth}`;
    }
    return request<UploadAssetResponse>(`/rooms/${encodeURIComponent(roomId)}/assets`, {
      method: "POST",
      body: file,
      headers: {
        "content-type": file.type || "application/octet-stream",
        ...(authorization ? { authorization } : {}),
      },
    });
  },
};
