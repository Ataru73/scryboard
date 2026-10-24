import { roomDocumentName } from "@scryboard/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type ConnectResult,
  connect,
  createRoom,
  startTestServer,
  type TestServer,
  tempDatabasePath,
} from "./helpers";

// Criterio di accettazione: un GM e 6 giocatori vedono le modifiche altrui in meno di 200 ms.
describe("latency with a full table", () => {
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

  it("delivers a GM change to 6 players well under 200 ms", async () => {
    const room = await createRoom(server);
    const name = roomDocumentName(room.id, "public");
    const results: ConnectResult[] = await Promise.all([
      connect(server, name, room.gmToken),
      ...Array.from({ length: 6 }, () => connect(server, name, "player")),
    ]);
    const clients = results.map((r) => {
      if (r.status !== "synced") throw new Error("not synced");
      return r;
    });
    const [gm, ...players] = clients as [(typeof clients)[0], ...typeof clients];

    const samples: number[] = [];
    for (let i = 0; i < 20; i++) {
      const key = `item-${i}`;
      const received = players.map(
        (p) =>
          new Promise<number>((resolve) => {
            const map = p.doc.getMap("items");
            const check = () => {
              if (map.has(key)) {
                map.unobserve(check);
                resolve(performance.now());
              }
            };
            map.observe(check);
          }),
      );
      const start = performance.now();
      gm.doc.getMap("items").set(key, { i });
      const times = await Promise.all(received);
      samples.push(Math.max(...times) - start);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95) - 1] as number;
    console.log(
      `latenza GM → 6 giocatori: mediana ${samples[10]?.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms`,
    );
    expect(p95).toBeLessThan(200);
    for (const c of clients) c.provider.destroy();
  });
});
