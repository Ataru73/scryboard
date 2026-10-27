import { roomDocumentName } from "@scryboard/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { isAllowedOrigin } from "../src/server";
import { connect, createRoom, startTestServer, type TestServer, tempDatabasePath } from "./helpers";

describe("collaboration server", () => {
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

  it("lets players join the public document", async () => {
    const room = await createRoom(server);
    const result = await connect(server, roomDocumentName(room.id, "public"), "player");
    expect(result.status).toBe("synced");
    if (result.status === "synced") result.provider.destroy();
  });

  it("denies players access to the GM document", async () => {
    const room = await createRoom(server);
    const result = await connect(server, roomDocumentName(room.id, "gm"), "player");
    expect(result.status).toBe("denied");
  });

  it("denies a GM token from another room", async () => {
    const roomA = await createRoom(server);
    const roomB = await createRoom(server);
    const result = await connect(server, roomDocumentName(roomB.id, "gm"), roomA.gmToken);
    expect(result.status).toBe("denied");
  });

  it("denies unknown rooms and malformed document names", async () => {
    expect((await connect(server, "room:doesnotexist1:public", "player")).status).toBe("denied");
    expect((await connect(server, "something-else", "player")).status).toBe("denied");
  });

  it("syncs changes between GM and players in real time", async () => {
    const room = await createRoom(server);
    const name = roomDocumentName(room.id, "public");
    const gm = await connect(server, name, room.gmToken);
    const player = await connect(server, name, "player");
    if (gm.status !== "synced" || player.status !== "synced") throw new Error("not synced");

    const received = new Promise<unknown>((resolve) => {
      player.doc.getMap("items").observe(() => resolve(player.doc.getMap("items").get("a")));
    });
    gm.doc.getMap("items").set("a", { kind: "text", text: "Ciao" });
    expect(await received).toEqual({ kind: "text", text: "Ciao" });

    gm.provider.destroy();
    player.provider.destroy();
  });

  it("prevents players from spoofing role='gm' in awareness", async () => {
    const room = await createRoom(server);
    const name = roomDocumentName(room.id, "public");
    const gm = await connect(server, name, room.gmToken);
    const player = await connect(server, name, "player");
    if (gm.status !== "synced" || player.status !== "synced") throw new Error("not synced");

    const awarenessReceived = new Promise<unknown>((resolve) => {
      gm.provider.awareness?.on("change", () => {
        const states = gm.provider.awareness?.getStates();
        const playerState = states?.get(player.provider.awareness?.clientID ?? 0);
        if (playerState?.user) resolve(playerState.user);
      });
    });

    player.provider.awareness?.setLocalStateField("user", {
      name: "Attacker",
      color: "#e5484d",
      role: "gm",
    });

    const receivedUser = (await awarenessReceived) as { role: string; name: string };
    expect(receivedUser.role).toBe("player");

    gm.provider.destroy();
    player.provider.destroy();
  });

  it("rejects WebSocket connections from untrusted origins", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/collab`, {
      headers: { Origin: "http://evil.com" },
    });
    const errorOccurred = await new Promise<boolean>((resolve) => {
      ws.on("error", () => resolve(true));
      ws.on("open", () => {
        ws.close();
        resolve(false);
      });
    });
    expect(errorOccurred).toBe(true);
  });

  it("allows WebSocket connections from matching origins", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/collab`, {
      headers: { Origin: `http://127.0.0.1:${server.port}` },
    });
    const opened = await new Promise<boolean>((resolve) => {
      ws.on("open", () => {
        ws.close();
        resolve(true);
      });
      ws.on("error", () => resolve(false));
    });
    expect(opened).toBe(true);
  });

  it("persists documents across restarts", async () => {
    const db = tempDatabasePath();
    let first: TestServer | null = await startTestServer(db.path);
    try {
      const room = await createRoom(first);
      const name = roomDocumentName(room.id, "gm");
      const gm = await connect(first, name, room.gmToken);
      if (gm.status !== "synced") throw new Error("not synced");
      gm.doc.getMap("items").set("secret", { kind: "text", text: "Il tesoro è nella cripta" });
      // Lascia arrivare l'aggiornamento al server prima di spegnerlo.
      await new Promise((r) => setTimeout(r, 100));
      gm.provider.destroy();
      await first.stop();
      first = null;

      const second = await startTestServer(db.path);
      try {
        const again = await connect(second, name, room.gmToken);
        if (again.status !== "synced") throw new Error("not synced");
        expect(again.doc.getMap("items").get("secret")).toEqual({
          kind: "text",
          text: "Il tesoro è nella cripta",
        });
        again.provider.destroy();
      } finally {
        await second.stop();
      }
    } finally {
      await first?.stop();
      db.cleanup();
    }
  });
});

describe("isAllowedOrigin", () => {
  it("allows requests without origin or without host", () => {
    expect(isAllowedOrigin(undefined, "localhost:3000")).toBe(true);
    expect(isAllowedOrigin("http://localhost:3000", undefined)).toBe(true);
  });

  it("matches same origin and host ignoring case and default ports", () => {
    expect(isAllowedOrigin("http://example.com", "example.com")).toBe(true);
    expect(isAllowedOrigin("https://example.com:443", "example.com")).toBe(true);
    expect(isAllowedOrigin("http://example.com:80", "example.com")).toBe(true);
    expect(isAllowedOrigin("http://localhost:3000", "localhost:3000")).toBe(true);
  });

  it("rejects mismatched origins and malformed origins", () => {
    expect(isAllowedOrigin("http://evil.com", "example.com")).toBe(false);
    expect(isAllowedOrigin("http://evil.com:3000", "localhost:3000")).toBe(false);
    expect(isAllowedOrigin("null", "localhost:3000")).toBe(false);
    expect(isAllowedOrigin("invalid-url", "localhost:3000")).toBe(false);
  });
});
