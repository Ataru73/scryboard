import { playerCredentials, ROLLS_MAP, type Roll, roomDocumentName } from "@scryboard/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, createRoom, startTestServer, type TestServer, tempDatabasePath } from "./helpers";

const arwen = playerCredentials("a1a1a1a1a1a1a1a1", "arwen-secret-0123456789");

describe("dice rolls", () => {
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

  const post = (roomId: string, authorization: string, body: Record<string, unknown>) =>
    fetch(`${server.baseUrl}/api/rooms/${roomId}/rolls`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization },
      body: JSON.stringify(body),
    });

  it("rolls on the server and shares public rolls through the public document", async () => {
    const room = await createRoom(server);
    const watcher = await connect(server, roomDocumentName(room.id, "public"), "player");
    if (watcher.status !== "synced") throw new Error("not synced");

    const res = await post(room.id, `Player ${arwen}`, { formula: "2d20kh1+5", name: "Arwen" });
    expect(res.status).toBe(201);
    const roll = (await res.json()) as Roll;
    expect(roll).toMatchObject({ formula: "2d20kh1+5", name: "Arwen", from: "a1a1a1a1a1a1a1a1" });
    expect(roll.total).toBeGreaterThanOrEqual(6);
    expect(roll.total).toBeLessThanOrEqual(25);

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(watcher.doc.getMap<Roll>(ROLLS_MAP).get(roll.id)?.total).toBe(roll.total);
    watcher.provider.destroy();
  });

  it("keeps the GM's hidden rolls out of the shared log, and only the GM may ask", async () => {
    const room = await createRoom(server);
    const watcher = await connect(server, roomDocumentName(room.id, "public"), "player");
    if (watcher.status !== "synced") throw new Error("not synced");

    const secret = await post(room.id, `Bearer ${room.gmToken}`, {
      formula: "1d20",
      name: "Master",
      hidden: true,
    });
    expect(secret.status).toBe(201);
    expect(
      (await post(room.id, `Player ${arwen}`, { formula: "1d20", name: "A", hidden: true })).status,
    ).toBe(403);

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(watcher.doc.getMap(ROLLS_MAP).size).toBe(0);
    watcher.provider.destroy();
  });

  it("rejects bad formulas and unknown senders", async () => {
    const room = await createRoom(server);
    const bad = await post(room.id, `Player ${arwen}`, { formula: "1d1", name: "A" });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toMatch(/facce/);
    expect((await post(room.id, "Player nope", { formula: "1d6", name: "A" })).status).toBe(401);
    expect(
      (await post("doesnotexist1", `Bearer ${room.gmToken}`, { formula: "1d6", name: "A" })).status,
    ).toBe(404);
  });

  it("reverts rolls forged by players", async () => {
    const room = await createRoom(server);
    const forger = await connect(server, roomDocumentName(room.id, "public"), "player");
    if (forger.status !== "synced") throw new Error("not synced");
    forger.doc.getMap(ROLLS_MAP).set("fake", {
      id: "fake",
      from: "gm",
      name: "GM",
      formula: "1d20",
      terms: [],
      total: 20,
      at: new Date().toISOString(),
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(forger.doc.getMap(ROLLS_MAP).has("fake")).toBe(false);
    forger.provider.destroy();
  });
});
