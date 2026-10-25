import { blob, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** SHA-256 del token del GM: il token in chiaro non viene mai salvato. */
  gmTokenHash: text("gm_token_hash").notNull(),
  createdAt: text("created_at").notNull(),
  /** Ultima connessione o modifica; null per le stanze create prima di questa colonna. */
  lastActiveAt: text("last_active_at"),
  /** Scena in cui si trovano i giocatori; la scena originale della stanza ha id "main". */
  activeScene: text("active_scene").notNull().default("main"),
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

/**
 * Giocatori di una stanza, per i messaggi privati: l'id del profilo è pubblico, il segreto (qui
 * il suo hash) resta nel browser del giocatore. Si registrano alla prima connessione alla loro
 * casella di posta.
 */
export const players = sqliteTable(
  "players",
  {
    roomId: text("room_id").notNull(),
    profileId: text("profile_id").notNull(),
    secretHash: text("secret_hash").notNull(),
    name: text("name").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.profileId] })],
);

/**
 * Scene di una stanza (la prima, "main", esiste sempre). L'elenco sta qui e non in un documento
 * Yjs: lo gestisce solo il GM, tramite le API, e il server decide chi può aprire quale scena.
 */
export const scenes = sqliteTable(
  "scenes",
  {
    roomId: text("room_id").notNull(),
    id: text("id").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.id] })],
);
