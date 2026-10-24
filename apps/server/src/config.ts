import { fileURLToPath } from "node:url";

export interface Config {
  port: number;
  host: string;
  databasePath: string;
  assetsDir: string;
  migrationsDir: string;
  webDistDir: string | null;
  /** Richieste consentite per IP ogni 10 minuti. */
  limits: { rooms: number; uploads: number; messages: number };
  /** Dietro un proxy (Fly.io, nginx) l'IP del client arriva negli header. */
  trustProxy: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? "0.0.0.0",
    databasePath: env.DATABASE_PATH ?? "./data/scryboard.db",
    assetsDir: env.ASSETS_DIR ?? "./data/assets",
    // Sia src/config.ts sia dist/index.js stanno un livello sotto la root del pacchetto.
    migrationsDir: fileURLToPath(new URL("../drizzle", import.meta.url)),
    webDistDir: env.WEB_DIST_DIR ?? null,
    limits: {
      rooms: Number(env.ROOMS_PER_10_MIN ?? 20),
      uploads: Number(env.UPLOADS_PER_10_MIN ?? 200),
      messages: Number(env.MESSAGES_PER_10_MIN ?? 300),
    },
    trustProxy: env.TRUST_PROXY === "true",
  };
}
