import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { HocuspocusProvider } from "@hocuspocus/provider";
import type { CreateRoomResponse } from "@scryboard/shared";
import * as Y from "yjs";
import { type Config, loadConfig } from "../src/config";
import { type RunningServer, startServer } from "../src/server";

export interface TestServer extends RunningServer {
  baseUrl: string;
  databasePath: string;
}

export function tempDatabasePath(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "scryboard-test-"));
  return {
    path: join(dir, "test.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export async function startTestServer(
  databasePath: string,
  overrides: Partial<Config> = {},
): Promise<TestServer> {
  const config: Config = {
    ...loadConfig({}),
    ...overrides,
    port: 0,
    host: "127.0.0.1",
    databasePath,
    assetsDir: join(dirname(databasePath), "assets"),
    assetStorage: { type: "local" },
  };
  const server = await startServer(config);
  return { ...server, baseUrl: `http://127.0.0.1:${server.port}`, databasePath };
}

export async function createRoom(server: TestServer, name = "Test"): Promise<CreateRoomResponse> {
  const res = await fetch(`${server.baseUrl}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (res.status !== 201) throw new Error(`createRoom failed: ${res.status}`);
  return (await res.json()) as CreateRoomResponse;
}

export type ConnectResult =
  | { status: "synced"; doc: Y.Doc; provider: HocuspocusProvider }
  | { status: "denied"; reason: string };

/** Si connette a un documento e attende la sincronizzazione o il rifiuto. */
export function connect(server: TestServer, name: string, token: string): Promise<ConnectResult> {
  const doc = new Y.Doc();
  return new Promise((resolve) => {
    const provider = new HocuspocusProvider({
      url: `ws://127.0.0.1:${server.port}/collab`,
      name,
      document: doc,
      token,
      onSynced: () => resolve({ status: "synced", doc, provider }),
      onAuthenticationFailed: ({ reason }) => {
        provider.destroy();
        resolve({ status: "denied", reason });
      },
    });
  });
}
