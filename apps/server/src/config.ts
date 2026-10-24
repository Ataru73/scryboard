import { fileURLToPath } from "node:url";

export interface Config {
  port: number;
  host: string;
  databasePath: string;
  assetsDir: string;
  migrationsDir: string;
  webDistDir: string | null;
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
  };
}
