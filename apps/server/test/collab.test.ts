import { roomDocumentName } from "@scryboard/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
