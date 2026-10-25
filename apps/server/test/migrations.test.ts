import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const DIR = join(import.meta.dirname, "..", "drizzle");
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

/** Numero della migrazione dal nome del file: «0004_scenes.sql» → 4. */
const number = (file: string) => Number.parseInt(file, 10);

function apply(db: Database.Database, file: string, transform = (sql: string) => sql) {
  for (const statement of transform(readFileSync(join(DIR, file), "utf8")).split(
    "--> statement-breakpoint",
  )) {
    db.exec(statement);
  }
}

describe("migrations", () => {
  it("give every room its main scene, even when 0004 ran without its data step", () => {
    const db = new Database(":memory:");
    const before = files.filter((f) => number(f) < 4);
    for (const file of before) apply(db, file);
    db.prepare(
      "INSERT INTO rooms (id, name, gm_token_hash, created_at) VALUES ('r1', 'Vecchia', 'h', '2026-01-01T00:00:00Z')",
    ).run();

    // La 0004 come l'ha applicata chi l'ha avuta prima che ricopiasse le stanze esistenti.
    apply(db, "0004_scenes.sql", (sql) =>
      sql.split("--> statement-breakpoint").slice(0, 2).join("--> statement-breakpoint"),
    );
    expect(db.prepare("SELECT * FROM scenes").all()).toEqual([]);

    for (const file of files.filter((f) => number(f) > 4)) apply(db, file);
    expect(db.prepare("SELECT room_id, id, name, position FROM scenes").all()).toEqual([
      { room_id: "r1", id: "main", name: "Scena 1", position: 0 },
    ]);
  });

  it("do not duplicate the main scene of rooms that already have it", () => {
    const db = new Database(":memory:");
    for (const file of files.filter((f) => number(f) <= 4)) {
      apply(db, file);
      if (file === "0003_players.sql") {
        db.prepare(
          "INSERT INTO rooms (id, name, gm_token_hash, created_at) VALUES ('r1', 'Vecchia', 'h', '2026-01-01T00:00:00Z')",
        ).run();
      }
    }
    expect(db.prepare("SELECT COUNT(*) AS n FROM scenes").get()).toEqual({ n: 1 });
    for (const file of files.filter((f) => number(f) > 4)) apply(db, file);
    expect(db.prepare("SELECT COUNT(*) AS n FROM scenes").get()).toEqual({ n: 1 });
  });
});
