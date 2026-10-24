import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, MiddlewareHandler } from "hono";

/**
 * IP del client: dietro un proxy si fida di Fly-Client-IP o del primo X-Forwarded-For solo se
 * `trustProxy` è attivo, altrimenti usa l'indirizzo della connessione.
 */
function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded =
      c.req.header("fly-client-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0];
    if (forwarded) return forwarded.trim();
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** Limite a finestra fissa per IP, in memoria: basta per un singolo processo. */
export function rateLimit(options: {
  max: number;
  windowMs: number;
  trustProxy: boolean;
  message: string;
}): MiddlewareHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return async (c, next) => {
    const now = Date.now();
    // Pulizia occasionale delle finestre scadute.
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    const key = clientIp(c, options.trustProxy);
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + options.windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    if (entry.count > options.max) {
      c.header("retry-after", String(Math.ceil((entry.resetAt - now) / 1000)));
      return c.json({ error: options.message }, 429);
    }
    await next();
  };
}
