import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, MiddlewareHandler } from "hono";

/**
 * IP del client: dietro un proxy si fida di Fly-Client-IP solo se l'app gira su Fly.io,
 * oppure del salto più a destra (immediato) di X-Forwarded-For per evitare spoofing da parte
 * del client. Altrimenti usa l'indirizzo della connessione socket.
 */
export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    if (process.env.FLY_APP_NAME) {
      const flyIp = c.req.header("fly-client-ip");
      if (flyIp) return flyIp.trim();
    }
    const xff = c.req.header("x-forwarded-for");
    if (xff) {
      const parts = xff.split(",");
      const rightmost = parts[parts.length - 1]?.trim();
      if (rightmost) return rightmost;
    }
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

const MAX_RATE_LIMIT_ENTRIES = 10_000;
const CLEANUP_INTERVAL_MS = 10_000;

/** Limite a finestra fissa per IP, in memoria: con capacità limitata e pulizia cadenzata. */
export function rateLimit(options: {
  max: number;
  windowMs: number;
  trustProxy: boolean;
  message: string;
}): MiddlewareHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  let lastCleanup = 0;

  return async (c, next) => {
    const now = Date.now();
    // Pulizia cadenzata delle finestre scadute per evitare cicli O(N) a ogni richiesta.
    if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
      lastCleanup = now;
      for (const [k, v] of hits) {
        if (v.resetAt <= now) hits.delete(k);
      }
    }
    const key = clientIp(c, options.trustProxy);
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      // Limite superiore alle dimensioni della mappa in memoria per prevenire DoS.
      if (hits.size >= MAX_RATE_LIMIT_ENTRIES) {
        const oldestKey = hits.keys().next().value;
        if (oldestKey) hits.delete(oldestKey);
      }
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
