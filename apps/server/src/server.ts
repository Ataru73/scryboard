import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { createAdaptorServer } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { WebSocketServer } from "ws";
import { AssetAccess } from "./assets/access";
import { LocalAssetStore } from "./assets/store";
import { createCollab } from "./collab/hocuspocus";
import { MessageService } from "./collab/messages";
import { publicReferenceCheck } from "./collab/references";
import type { Config } from "./config";
import { openDatabase } from "./db/client";
import { createApi } from "./http/app";
import { PlayerService } from "./rooms/players";
import { RoomService } from "./rooms/service";

export const COLLAB_PATH = "/collab";

export interface RunningServer {
  port: number;
  stop: () => Promise<void>;
}

export async function startServer(config: Config): Promise<RunningServer> {
  const { db, close: closeDb } = openDatabase(config.databasePath, config.migrationsDir);
  const rooms = new RoomService(db);
  const players = new PlayerService(db);
  const collab = createCollab(db, rooms, players);

  const app = new Hono();
  if (process.env.NODE_ENV !== "test") app.use(logger());
  const access = new AssetAccess(db, publicReferenceCheck(collab, db));
  app.route(
    "/api",
    createApi(
      rooms,
      new LocalAssetStore(config.assetsDir),
      access,
      {
        limits: config.limits,
        trustProxy: config.trustProxy,
      },
      { messages: new MessageService(collab, players), players },
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
