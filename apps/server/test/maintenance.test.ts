import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { roomDocumentName } from "@scryboard/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { openDatabase } from "../src/db/client";
import { documents, rooms } from "../src/db/schema";
import { pruneInactiveRooms } from "../src/rooms/prune";
import { RoomService } from "../src/rooms/service";
import { startTestServer, tempDatabasePath } from "./helpers";

describe("rate limits", () => {
  it("refuses to create too many rooms from the same address", async () => {
    const db = tempDatabasePath();
    const server = await startTestServer(db.path, { limits: { rooms: 2, uploads: 2 } });
    try {
      const create = () =>
        fetch(`${server.baseUrl}/api/rooms`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "x" }),
        });
      expect((await create()).status).toBe(201);
      expect((await create()).status).toBe(201);
      const refused = await create();
      expect(refused.status).toBe(429);
      expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    } finally {
      await server.stop();
      db.cleanup();
    }
  });
});

describe("room activity and pruning", () => {
  function setup() {
    const tmp = tempDatabasePath();
    const { db, close } = openDatabase(tmp.path, loadConfig({}).migrationsDir);
    const service = new RoomService(db);
    const assetsDir = join(dirname(tmp.path), "assets");
    return {
      db,
      service,
      assetsDir,
      cleanup: () => {
        close();
        tmp.cleanup();
      },
    };
  }

  it("records activity at most once a minute", () => {
    const { db, service, cleanup } = setup();
    const room = service.create("Attiva");
    const t0 = Date.parse("2030-01-01T00:00:00Z");
    service.touch(room.id, t0);
    service.touch(room.id, t0 + 30_000);
    const read = () => db.select().from(rooms).where(eq(rooms.id, room.id)).get()?.lastActiveAt;
    expect(read()).toBe("2030-01-01T00:00:00.000Z");
    service.touch(room.id, t0 + 61_000);
    expect(read()).toBe("2030-01-01T00:01:01.000Z");
    cleanup();
  });

  it("deletes rooms inactive for longer than the given days, with documents and images", async () => {
    const { db, service, assetsDir, cleanup } = setup();
    const old = service.create("Vecchia");
    const recent = service.create("Recente");
    db.update(rooms)
      .set({ lastActiveAt: "2020-01-01T00:00:00.000Z" })
      .where(eq(rooms.id, old.id))
      .run();
    db.insert(documents)
      .values({
        name: roomDocumentName(old.id, "public"),
        state: Buffer.from([0]),
        updatedAt: "2020",
      })
      .run();
    mkdirSync(join(assetsDir, old.id), { recursive: true });
    writeFileSync(join(assetsDir, old.id, "x.png"), "x");

    const deleted = await pruneInactiveRooms(db, service, assetsDir, 90);
    expect(deleted).toEqual([old.id]);
    expect(service.get(old.id)).toBeNull();
    expect(service.get(recent.id)).not.toBeNull();
    expect(db.select().from(documents).all()).toEqual([]);
    expect(existsSync(join(assetsDir, old.id))).toBe(false);
    cleanup();
  });
});
