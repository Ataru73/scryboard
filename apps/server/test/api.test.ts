import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { startServer } from "../src/server";
import { createRoom, startTestServer, type TestServer, tempDatabasePath } from "./helpers";

describe("rooms API", () => {
  let server: TestServer;
  let cleanup: () => void;

  beforeAll(async () => {
    const db = tempDatabasePath();
    cleanup = db.cleanup;
    server = await startTestServer(db.path);
  });
  afterAll(async () => {
    await server.stop();
    cleanup();
  });

  it("creates a room and returns the GM token once", async () => {
    const room = await createRoom(server, "  La Torre  ");
    expect(room.name).toBe("La Torre");
    expect(room.id).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(room.gmToken.length).toBeGreaterThanOrEqual(32);

    const res = await fetch(`${server.baseUrl}/api/rooms/${room.id}`);
    expect(res.status).toBe(200);
    const info = await res.json();
    expect(info).toEqual({ id: room.id, name: "La Torre", createdAt: room.createdAt });
  });

  it.each([{}, { name: "" }, { name: "x".repeat(81) }, null])(
    "rejects invalid body %j",
    async (body) => {
      const res = await fetch(`${server.baseUrl}/api/rooms`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(400);
    },
  );

  it("returns 404 for unknown rooms", async () => {
    expect((await fetch(`${server.baseUrl}/api/rooms/doesnotexist1`)).status).toBe(404);
    expect((await fetch(`${server.baseUrl}/api/rooms/..%2Fetc`)).status).toBe(404);
  });

  it("checks GM tokens", async () => {
    const room = await createRoom(server);
    const check = async (token: unknown) => {
      const res = await fetch(`${server.baseUrl}/api/rooms/${room.id}/gm-check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      return ((await res.json()) as { valid: boolean }).valid;
    };
    expect(await check(room.gmToken)).toBe(true);
    expect(await check("wrong")).toBe(false);
    expect(await check(42)).toBe(false);
  });
});

describe("unknown API routes", () => {
  it("answer 404 JSON instead of the web app", async () => {
    const db = tempDatabasePath();
    const server = await startTestServer(db.path);
    try {
      const res = await fetch(`${server.baseUrl}/api/nope`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
    } finally {
      await server.stop();
      db.cleanup();
    }
  });
});

describe("security headers", () => {
  let server: TestServer;
  let cleanup: () => void;

  beforeAll(async () => {
    const db = tempDatabasePath();
    cleanup = db.cleanup;
    server = await startTestServer(db.path);
  });
  afterAll(async () => {
    await server.stop();
    cleanup();
  });

  it("sets standard security headers on responses", async () => {
    const res = await fetch(`${server.baseUrl}/api/health`);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    const csp = res.headers.get("content-security-policy");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

describe("startup", () => {
  it("explains when the port is already in use", async () => {
    const dbA = tempDatabasePath();
    const dbB = tempDatabasePath();
    const first = await startTestServer(dbA.path);
    try {
      await expect(
        startServer({
          ...loadConfig({}),
          host: "127.0.0.1",
          port: first.port,
          databasePath: dbB.path,
        }),
      ).rejects.toThrow(`La porta ${first.port} è già in uso`);
    } finally {
      await first.stop();
      dbA.cleanup();
      dbB.cleanup();
    }
  });
});
