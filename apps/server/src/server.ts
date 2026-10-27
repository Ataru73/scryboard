import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { createAdaptorServer } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { WebSocketServer } from "ws";
import { AssetAccess } from "./assets/access";
import { createAssetStore } from "./assets/store";
import { createCollab } from "./collab/hocuspocus";
import { MessageService } from "./collab/messages";
import { publicReferenceCheck } from "./collab/references";
import { RollService } from "./collab/rolls";
import { SceneCollab } from "./collab/scenes";
import type { Config } from "./config";
import { openDatabase } from "./db/client";
import { createApi } from "./http/app";
import { ArchiveService } from "./rooms/archive";
import { PlayerService } from "./rooms/players";
import { SceneService } from "./rooms/scenes";
import { RoomService } from "./rooms/service";

export const COLLAB_PATH = "/collab";

/**
 * Verifica che l'origine della richiesta WebSocket corrisponda all'host di destinazione
 * per prevenire attacchi di tipo Cross-Site WebSocket Hijacking (CSWSH).
 * Client programmatici che omettono l'header Origin sono ammessi.
 */
export function isAllowedOrigin(
  originHeader: string | undefined,
  hostHeader: string | undefined,
): boolean {
  if (!originHeader || !hostHeader) return true;
  try {
    const originHost = new URL(originHeader).host.toLowerCase();
    const targetHost = new URL(
      hostHeader.includes("://") ? hostHeader : `http://${hostHeader}`,
    ).host.toLowerCase();
    return originHost === targetHost;
  } catch {
    return false;
  }
}

export interface RunningServer {
  port: number;
  stop: () => Promise<void>;
}

export async function startServer(config: Config): Promise<RunningServer> {
  const { db, close: closeDb } = openDatabase(config.databasePath, config.migrationsDir);
  const assetStore = await createAssetStore(config);
  const rooms = new RoomService(db);
  const players = new PlayerService(db);
  const sceneService = new SceneService(db);
  const collab = createCollab(db, rooms, players, sceneService);

  const app = new Hono();
  if (process.env.NODE_ENV !== "test") app.use(logger());
  app.use(
    "*",
    secureHeaders({
      xFrameOptions: "DENY",
      referrerPolicy: "strict-origin-when-cross-origin",
      strictTransportSecurity: false,
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "blob:", "data:"],
        mediaSrc: ["'self'", "blob:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "ws:", "wss:", "https://generativelanguage.googleapis.com"],
        frameAncestors: ["'none'"],
      },
    }),
  );
  const access = new AssetAccess(db, publicReferenceCheck(collab, db, sceneService));
  const archive = new ArchiveService(collab, rooms, sceneService, assetStore, access);
  app.route(
    "/api",
    createApi(
      rooms,
      assetStore,
      access,
      {
        limits: config.limits,
        trustProxy: config.trustProxy,
      },
      {
        messages: new MessageService(collab, players),
        players,
        rolls: new RollService(collab, sceneService),
        scenes: { service: sceneService, collab: new SceneCollab(collab, sceneService) },
        archive,
      },
    ),
  );
  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  if (config.webDistDir) {
    const root = config.webDistDir;
    const indexHtml = readFileSync(join(root, "index.html"), "utf8");
    app.use("/*", serveStatic({ root }));
    // Fallback per le rotte della single-page app (es. /r/<id>).
    app.get("*", (c) => c.html(indexHtml));
  }

  const server = createAdaptorServer({ fetch: app.fetch }) as Server;

  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== COLLAB_PATH) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      socket.destroy();
      return;
    }
    const origin = request.headers.origin;
    const host =
      (config.trustProxy && typeof request.headers["x-forwarded-host"] === "string"
        ? request.headers["x-forwarded-host"].split(",")[0]?.trim()
        : null) || request.headers.host;
    if (!isAllowedOrigin(origin, host)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (typeof value === "string") headers.set(key, value);
        else if (Array.isArray(value)) headers.set(key, value.join(", "));
      }
      const client = collab.handleConnection(
        ws,
        new Request(`http://${request.headers.host ?? "localhost"}${request.url}`, { headers }),
      );
      ws.on("message", (data: Buffer) => client.handleMessage(new Uint8Array(data)));
      ws.on("pong", () => client.touch());
      ws.on("close", (code, reason) => client.handleClose({ code, reason: reason.toString() }));
      ws.on("error", (error) => console.error("WebSocket error", error));
    });
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.port, config.host, () => {
        server.off("error", reject);
        resolve();
      });
    });
  } catch (error) {
    closeDb();
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
      throw new Error(
        `La porta ${config.port} è già in uso: chiudi l'altro processo o imposta PORT.`,
        { cause: error },
      );
    }
    throw error;
  }
  const { port } = server.address() as AddressInfo;

  return {
    port,
    async stop() {
      // Salva subito i documenti con modifiche in attesa prima di chiudere il database.
      collab.flushPendingStores();
      collab.closeConnections();
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      closeDb();
    },
  };
}
