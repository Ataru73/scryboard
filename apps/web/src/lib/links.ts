/**
 * Il token del GM viaggia nel frammento dell'URL (#gm=...), che il browser non invia mai al
 * server né negli header Referer.
 */
export function playerLink(origin: string, roomId: string): string {
  return `${origin}/r/${roomId}`;
}

export function gmLink(origin: string, roomId: string, gmToken: string): string {
  return `${playerLink(origin, roomId)}#gm=${encodeURIComponent(gmToken)}`;
}

export function gmTokenFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get("gm");
  return token || null;
}

export function roomIdFromPath(pathname: string): string | null {
  const match = /^\/r\/([A-Za-z0-9_-]+)\/?$/.exec(pathname);
  return match ? (match[1] as string) : null;
}
