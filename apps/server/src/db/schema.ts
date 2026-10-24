import { blob, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** SHA-256 del token del GM: il token in chiaro non viene mai salvato. */
  gmTokenHash: text("gm_token_hash").notNull(),
  createdAt: text("created_at").notNull(),
});

/** Snapshot Yjs dei documenti, uno per nome (`room:<id>:<scope>`). */
export const documents = sqliteTable("documents", {
  name: text("name").primaryKey(),
  state: blob("state", { mode: "buffer" }).notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Visibilità delle immagini caricate. Quelle del GM nascono private e diventano pubbliche quando
 * un oggetto che le usa compare nel documento pubblico. Gli asset senza riga (caricati prima di
 * questa tabella) sono considerati pubblici.
 */
export const assets = sqliteTable(
  "assets",
  {
    roomId: text("room_id").notNull(),
    assetId: text("asset_id").notNull(),
    public: integer("public", { mode: "boolean" }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.assetId] })],
);
