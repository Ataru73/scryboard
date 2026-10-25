import { fileURLToPath } from "node:url";

export interface Config {
  port: number;
  host: string;
  databasePath: string;
  assetsDir: string;
  /** Dove stanno le immagini: su disco, o su un bucket Google Cloud Storage. */
  assetStorage: { type: "local" } | { type: "gcs"; bucket: string };
  migrationsDir: string;
  webDistDir: string | null;
  /** Richieste consentite per IP ogni 10 minuti. */
  limits: { rooms: number; uploads: number; messages: number; rolls: number };
  /** Dietro un proxy (Fly.io, nginx) l'IP del client arriva negli header. */
  trustProxy: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const storage = env.ASSET_STORAGE ?? "local";
  if (storage !== "local" && storage !== "gcs") {
    throw new Error(`ASSET_STORAGE non valido: "${storage}" (usa "local" o "gcs")`);
  }
  if (storage === "gcs" && !env.GCS_BUCKET) {
    throw new Error("ASSET_STORAGE=gcs richiede GCS_BUCKET");
  }
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? "0.0.0.0",
    databasePath: env.DATABASE_PATH ?? "./data/scryboard.db",
    assetsDir: env.ASSETS_DIR ?? "./data/assets",
    assetStorage:
      storage === "gcs" ? { type: "gcs", bucket: env.GCS_BUCKET as string } : { type: "local" },
    // Sia src/config.ts sia dist/index.js stanno un livello sotto la root del pacchetto.
    migrationsDir: fileURLToPath(new URL("../drizzle", import.meta.url)),
    webDistDir: env.WEB_DIST_DIR ?? null,
    limits: {
      rooms: Number(env.ROOMS_PER_10_MIN ?? 20),
      uploads: Number(env.UPLOADS_PER_10_MIN ?? 200),
      messages: Number(env.MESSAGES_PER_10_MIN ?? 300),
      rolls: Number(env.ROLLS_PER_10_MIN ?? 600),
    },
    trustProxy: env.TRUST_PROXY === "true",
  };
}
