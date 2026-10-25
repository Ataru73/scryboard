import { parseArgs } from "node:util";
import { createAssetStore } from "./assets/store";
import { loadConfig } from "./config";
import { openDatabase } from "./db/client";
import { pruneInactiveRooms } from "./rooms/prune";
import { RoomService } from "./rooms/service";

/** Uso: node dist/prune.js --days 90 [--dry-run] */
const { values } = parseArgs({
  options: {
    days: { type: "string", default: "90" },
    "dry-run": { type: "boolean", default: false },
  },
});
const days = Number(values.days);
if (!Number.isFinite(days) || days < 1) {
  console.error("--days deve essere un numero di giorni ≥ 1");
  process.exit(1);
}

const config = loadConfig();
const { db, close } = openDatabase(config.databasePath, config.migrationsDir);
const rooms = new RoomService(db);
if (values["dry-run"]) {
  const ids = rooms.inactiveSince(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
  console.log(`${ids.length} stanze inattive da più di ${days} giorni (nessuna eliminata).`);
} else {
  const ids = await pruneInactiveRooms(db, rooms, await createAssetStore(config), days);
  console.log(`Eliminate ${ids.length} stanze inattive da più di ${days} giorni.`);
}
close();
