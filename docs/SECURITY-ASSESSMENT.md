# Security Assessment — Scryboard

**Date:** 2026-10-27  
**Scope:** `apps/server`, `apps/web`, `packages/shared`, Docker & deployment configurations

---

## 1. Executive Summary & Positive Controls

Scryboard has a well-designed security architecture for a zero-account collaborative tabletop application:
- **Strong GM Token Cryptography & Transport**: GM tokens use 256 bits of cryptographic randomness ([`generateGmToken`](../apps/server/src/rooms/tokens.ts)), are stored as SHA-256 hashes ([`rooms.gmTokenHash`](../apps/server/src/db/schema.ts)), verified in constant time via `timingSafeEqual` ([`tokenMatchesHash`](../apps/server/src/rooms/tokens.ts)), and passed in the URL fragment (`#gm=...`) before being stripped from the address bar via `history.replaceState` ([`loadRoom`](../apps/web/src/pages/RoomPage.tsx)) so they never leak in HTTP `Referer` headers or server access logs.
- **Yjs Document Separation**: Hidden objects (`room:<id>:gm`), inactive scenes (`room:<id>:s:<scene>:...`), and private mailboxes (`room:<id>:mail:<id>`) are isolated into separate Yjs documents with authentication enforced in [`createCollab`](../apps/server/src/collab/hocuspocus.ts).
- **SQL Injection & XSS Defenses**: Database queries use parameterized Drizzle ORM statements ([`RoomService`](../apps/server/src/rooms/service.ts), [`PlayerService`](../apps/server/src/rooms/players.ts), [`SceneService`](../apps/server/src/rooms/scenes.ts)). The custom Markdown renderer ([`Markdown`](../apps/web/src/board/markdown.tsx)) outputs React elements directly without `dangerouslySetInnerHTML` and restricts links to `http(s)://` with `rel="noopener noreferrer"`.
- **Safe Asset Handling**: Uploaded files are validated by magic bytes (excluding active formats like SVG/HTML), named by their SHA-256 digest ([`assetIdFor`](../apps/server/src/assets/store.ts)), and served with `X-Content-Type-Options: nosniff` ([`createApi`](../apps/server/src/http/app.ts)).

However, several **High** and **Medium** severity vulnerabilities were identified in the real-time Yjs document guard, item schema permissions, proxy IP rate limiting, and memory/DoS bounds.

| ID      | Finding                                                                                                   | Severity   | Component                                                                    | Status       |
| :------ | :-------------------------------------------------------------------------------------------------------- | :--------- | :--------------------------------------------------------------------------- | :----------- |
| **H-1** | Complete bypass of `guardPublicDocument` via back-to-back Yjs updates (`queueMicrotask` stale `oldValue`) | **High**   | `apps/server/src/collab/guard.ts`                                            | **Resolved** |
| **H-2** | Player privilege escalation via missing layer constraints in `boardItemSchema` and unchecked `createdBy`  | **High**   | `packages/shared/src/board.ts`, `apps/server/src/collab/guard.ts`            | **Resolved** |
| **H-3** | Rate-limit bypass and algorithmic complexity DoS via `Fly-Client-IP` / `X-Forwarded-For` spoofing         | **High**   | `apps/server/src/http/rateLimit.ts`                                          | **Resolved** |
| **H-4** | Denial of Service (OOM crash & event-loop blocking) via archive import and unbounded Yjs payloads         | **High**   | `apps/server/src/rooms/archive.ts`, `packages/shared/src/board.ts`           | **Resolved** |
| **M-1** | Fog of War, Dynamic Vision, and Secret Doors are enforced only client-side                                | **Medium** | `packages/shared/src/walls.ts`, `apps/web/src/board/store.ts`                | Open         |
| **M-2** | Unvalidated Yjs awareness payloads allow remote client UI crash (DoS) and role/identity spoofing          | **Medium** | `apps/web/src/board/Presence.tsx`, `apps/web/src/hooks/useRoomConnection.ts` | Open         |
| **M-3** | Display-name spoofing in dice rolls & private messages and unauthenticated asset uploads                  | **Medium** | `apps/server/src/http/app.ts`, `apps/server/src/collab/rolls.ts`             | Open         |
| **M-4** | Missing HTTP security headers (CSP, Clickjacking, HSTS) and WebSocket `Origin` validation                 | **Medium** | `apps/server/src/server.ts`, `apps/web/src/lib/storage.ts`                   | Open         |
| **L-1** | Docker container runs as `root` & hardcoded GCP project in deploy script                                  | **Low**    | `Dockerfile`, `scripts/deploy-cloud-run.sh`                                  | Open         |
| **L-2** | Unescaped `_` wildcard and orphaned `scenes` rows in `pruneInactiveRooms`                                 | **Low**    | `apps/server/src/rooms/prune.ts`                                             | Open         |
| **L-3** | Missing rate limit on `/gm-check` & asset visibility ordering in `ArchiveService.import`                  | **Low**    | `apps/server/src/http/app.ts`, `apps/server/src/rooms/archive.ts`            | Open         |

---

## 2. High Severity Findings

### H-1. Complete Bypass of `guardPublicDocument` via Back-to-Back Yjs Updates (`queueMicrotask` Stale `oldValue`)

- **Location**: [`guardPublicDocument`](../apps/server/src/collab/guard.ts) (lines 155–208)
- **Vulnerability**: When a player makes an unauthorized change to any guarded `Y.Map` (`items`, `walls`, `rolls`, `settings`, `fog`, `terrain`), the observer captures `change.action` and `change.oldValue` and schedules a revert callback inside `queueMicrotask`:

  ```ts
  const { action, oldValue } = change;
  reverts.push(() => {
    if (action === "add") map.delete(key);
    else map.set(key, oldValue);
  });
  ```

  Because `ws` processes multiple WebSocket frames arriving in a single TCP chunk synchronously in its receive loop before microtasks run, a malicious player can send two frames back-to-back targeting the same `key`:
  1. **Injecting any forbidden key**: Frame 1 adds `key -> V_forbidden`. `change.action` is `"add"`, so Revert 1 queues `map.delete(key)`. Before the microtask runs, Frame 2 updates `key -> V_forbidden_2`. Because `key` already exists in `map` from Frame 1, Frame 2 observes `change.action === "update"` and **`change.oldValue === V_forbidden`**, queuing `map.set(key, V_forbidden)`. When the microtask queue drains, Revert 1 deletes `key` and Revert 2 writes `V_forbidden` under `GUARD_ORIGIN`.
  2. **Overwriting/deleting any existing GM key**: Frame 1 updates `key` from `V_gm` to `V_attack` (queuing `map.set(key, V_gm)`), and Frame 2 updates `key` from `V_attack` to `V_attack_2` (seeing `oldValue = V_attack` and queuing `map.set(key, V_attack)`). Revert 2 overwrites `V_gm` with `V_attack`.
- **Impact**: Any connected player can bypass all server-side guards on `room:<id>:public`—erasing fog of war, deleting walls/locked doors, forging server dice rolls in `rolls`, modifying locked/map-layer objects, or changing room settings (`grid`, `lighting`, `turn`, `summon`, `handout`).
- **Remediation**: Track the last known valid state per `(map, key)` (or record only the first `action`/`oldValue` for a given `key` until the pending revert transaction has flushed) instead of trusting `change.oldValue` from an already-tainted map.

---

### H-2. Player Privilege Escalation via Missing Layer Constraints in `boardItemSchema` and Unchecked `createdBy` in `guard.ts`

- **Location**: [`boardItemSchema`](../packages/shared/src/board.ts) (lines 11–342), [`canModify`](../packages/shared/src/permissions.ts) (lines 8–16), [`isAllowedPlayerItemChange`](../apps/server/src/collab/guard.ts) (lines 90–115), [`viewerTokens` / `lightSources`](../apps/web/src/vision/sources.ts) (lines 32–94)
- **Vulnerability**:
  1. **GM-only item kinds allowed on player layers**: `lightItemSchema`, `roofItemSchema`, `noteItemSchema`, `stampItemSchema`, and `pathItemSchema` all spread `baseItem`, which allows `layer: z.enum(["paths", "map", "token", "draw"])`. Because `canModify` only checks `!GM_LAYERS.includes(item.layer) && !item.locked`, a player can add `light`, `note`, `roof`, `stamp`, or `path` items (or `image` items with `overhead: true` or `.webm`/`.mp4` video `assetId`s) by setting `layer: "draw"` or `"token"`. In `lightSources()`, any `kind: "light"` item illuminates dark areas at night regardless of its layer.
  2. **Token vision hijacking via `createdBy`**: `isAllowedPlayerItemChange` locks `vision`, `light`, and `owners` on tokens, but does not check `createdBy`. Because `viewerTokens()` grants a player vision through any token where `i.createdBy === viewerId`, a player can update `createdBy` on any unlocked GM/monster token to gain its vision and darkvision.
- **Remediation**:
  - Restrict `layer` in `pathItemSchema` to `z.literal("paths")`, and in `lightItemSchema`, `noteItemSchema`, `stampItemSchema`, and `roofItemSchema` to `z.literal("map")`. Disallow `overhead: true` and video `assetId`s (`isVideoAsset(after.assetId)`) when `layer !== "map"`.
  - Enforce `before.createdBy === after.createdBy` in `isAllowedPlayerItemChange`.

---

### H-3. Rate-Limit Bypass and Algorithmic Complexity DoS via `Fly-Client-IP` / `X-Forwarded-For` Spoofing

- **Location**: [`clientIp` and `rateLimit`](../apps/server/src/http/rateLimit.ts) (lines 8–45)
- **Vulnerability**:
  1. When `TRUST_PROXY=true` (enabled in [`docker-compose.yml`](../docker-compose.yml), [`fly.toml`](../fly.toml), and [`scripts/deploy-cloud-run.sh`](../scripts/deploy-cloud-run.sh)), `clientIp` reads:

     ```ts
     const forwarded =
       c.req.header("fly-client-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0];
     ```
  2. On Google Cloud Run and standard reverse proxies (Caddy, nginx), `Fly-Client-IP` is not set or stripped by the proxy, so any client can send a fake `Fly-Client-IP` header to bypass rate limiting.
  3. Standard reverse proxies append the client's real IP to the **end** of `X-Forwarded-For`. Reading `.split(",")[0]` trusts the client-supplied leftmost address.
  4. Once `hits.size > 10_000` (line 32), every request iterates through the entire `hits` `Map` (`O(N)` per request). An attacker sending requests with random `X-Forwarded-For` values will populate tens of thousands of entries that do not expire for 10 minutes, causing high CPU usage on every request and unbounded memory growth.
- **Remediation**: Parse the **rightmost** untrusted hop from `X-Forwarded-For` (`split(",").at(-1)?.trim()`), only trust `Fly-Client-IP` when specifically configured for Fly.io, and cap the maximum size of the `hits` map (evicting oldest entries when full).

---

### H-4. Denial of Service (OOM Crash & Event-Loop Blocking) via Archive Import and Unbounded Yjs Payloads

- **Location**: [`ArchiveService.unpack` / `ArchiveService.import`](../apps/server/src/rooms/archive.ts) (lines 38–41, 122–262), [`createApi`](../apps/server/src/http/app.ts) (lines 154–170), [`startServer`](../apps/server/src/server.ts) (line 75), [`strokeItemSchema`](../packages/shared/src/board.ts) (lines 38–45)
- **Vulnerability**:
  1. **Memory exhaustion on `/api/rooms/import`**: The unauthenticated import endpoint accepts a 200 MB body (`MAX_ARCHIVE_BYTES`) and unzips up to 600 MB (`MAX_UNZIPPED_BYTES`, with `MAX_DOC_BYTES = 50 MB` per Yjs doc) synchronously in memory while retaining `data` and `files` in scope. Peak memory for a single request easily exceeds 800 MB–1.5 GB, whereas production is configured for a single instance with `512mb` RAM ([`fly.toml`](../fly.toml)) or `1Gi` ([`scripts/deploy-cloud-run.sh`](../scripts/deploy-cloud-run.sh)).
  2. **Unbounded central directory scan in `unpack`**: In `ArchiveService.unpack`, `++count > MAX_FILES` is checked _after_ `if (!ENTRY_PATH.test(file.name)) return false`, allowing a ZIP with 65,535 ignored entries to be scanned synchronously.
  3. **Unbounded Yjs document & item growth**:
     - `guardPublicDocument` only watches 6 known `Y.Map` names; players can write arbitrary data to any other top-level key in `room:<id>:public` (up to `maxPayload: 16 MB` per WebSocket message).
     - Item schemas in `packages/shared/src/board.ts` do not use `.strict()`, so extra fields of arbitrary size on a valid item pass `boardItemSchema.safeParse` in `guard.ts` and are persisted in the Yjs document and SQLite.
     - `strokeItemSchema.shape.points` has `.min(2)` with no `.max(...)` bound.
- **Remediation**:
  - Lower `MAX_ARCHIVE_BYTES`, `MAX_UNZIPPED_BYTES`, and `MAX_DOC_BYTES` to fit within container memory limits, and increment `count` before checking `ENTRY_PATH`.
  - Add `.strict()` to all item schemas in `packages/shared/src/board.ts`, add `.max(20000)` to `strokeItemSchema.shape.points`, and reject/revert unknown root keys or oversized Yjs updates on public documents.

---

## 3. Medium Severity Findings

### M-1. Fog of War, Dynamic Vision, and Secret Doors Are Enforced Only Client-Side

- **Location**: [`README.md`](../README.md) (lines 19–20), [`doorSchema`](../packages/shared/src/walls.ts) (lines 27–38), [`BoardStore`](../apps/web/src/board/store.ts) (lines 104–142)
- **Vulnerability**: While `README.md` states _"Secrets enforced by the server: hidden objects, fog of war and private messages never reach players' browsers"_, only explicitly hidden items (`room:<id>:gm`), obscured token identities (`MASKS_MAP`), secret HP values (`VITALS_MAP`), and private messages (`room:<id>:mail:*`) are kept off players' clients.
  - All secret doors (`kind: "door", secret: true` in `WALLS_MAP`), invisible walls, terrain painted "under the fog" (`addTerrainBatch`), the full map image, and any non-hidden tokens under the fog live in `room:<id>:public` and are sent in full to all players.
- **Remediation**: Update documentation to clarify that Fog of War and Dynamic Vision are visual masks over the public scene while only _Hidden Objects_ (`Shift+H`), _Incognito Identities_, _Secret HP_, and _Inactive Scenes_ are withheld by the server—or move `secret: true` door metadata into `room:<id>:gm` (representing secret doors as normal walls in `room:<id>:public` until revealed).

---

### M-2. Unvalidated Yjs Awareness Payloads Allow Remote Client UI Crash (DoS) and Role/Identity Spoofing

- **Location**: [`useRoomConnection`](../apps/web/src/hooks/useRoomConnection.ts) (lines 130–150), [`usePlayers`](../apps/web/src/board/usePlayers.ts) (lines 15–29), [`Presence`](../apps/web/src/board/Presence.tsx) (lines 109–241), [`MessagesPanel`](../apps/web/src/messages/MessagesPanel.tsx) (lines 36–44)
- **Vulnerability**:
  1. **Remote React Crash**: Hocuspocus relays awareness states without validation, and the web client casts `state.user`, `state.draft`, `state.ping`, `state.ruler`, and `state.template` with TypeScript `as` assertions instead of runtime Zod schemas. If a client broadcasts `{ user: { name: 123 } }` or `{ draft: { origin: { x: 0, y: 0 }, points: null } }`, `a.name.localeCompare(b.name)` or `<Line points={draft.points} />` throws an uncaught `TypeError` during render, crashing the room UI for all connected participants.
  2. **Awareness Role & Profile ID Spoofing**: Any player can broadcast `user: { role: "gm", name: "..." }` in awareness to show a `GM` badge in the participant list ([`RoomPage.tsx`](../apps/web/src/pages/RoomPage.tsx)), or broadcast another player's `id` with a different `name` to overwrite their display name in `usePlayers` and `MessagesPanel`.
- **Remediation**: Validate all awareness fields with Zod schemas before rendering in `Presence.tsx` and `useRoomConnection.ts`, and sanitize/enforce `role` and `id` on awareness updates on the server in `hocuspocus.ts`.

---

### M-3. Display-Name Spoofing in Dice Rolls & Private Messages and Unauthenticated Asset Uploads

- **Location**: [`resolveSender` and `POST /rooms/:id/assets`](../apps/server/src/http/app.ts) (lines 110–222), [`RollService.roll`](../apps/server/src/collab/rolls.ts) (lines 25–34)
- **Vulnerability**:
  - Any client with the `roomId` can invent new `Player <id>:<secret>` credentials and call `POST /api/rooms/:id/rolls` or `POST /api/rooms/:id/messages` with `name` / `fromName` set to `"GM"` or another player's name. Because [`RollPanel.tsx`](../apps/web/src/dice/RollPanel.tsx) and [`RollToasts.tsx`](../apps/web/src/dice/RollToasts.tsx) only render `roll.name`, a player can forge public dice rolls appearing to come from the GM or another player.
  - `POST /api/rooms/:id/assets` requires no player credentials at all, allowing any unauthenticated caller who knows `roomId` (and cross-origin simple `fetch` requests) to upload up to 200 × 20 MB = 4 GB of assets per 10 minutes.
- **Remediation**: Require valid GM or Player `Authorization` headers on `POST /api/rooms/:id/assets`, reserve the `"GM"` name for `sender.kind === "gm"`, and visually distinguish GM rolls (`roll.from === "gm"`) in `RollPanel.tsx` and `RollToasts.tsx`.

---

### M-4. Missing HTTP Security Headers (CSP, Clickjacking, HSTS) and WebSocket `Origin` Validation

- **Location**: [`startServer`](../apps/server/src/server.ts) (lines 65–97), [`storage.ts`](../apps/web/src/lib/storage.ts) (lines 46–137)
- **Vulnerability**:
  - Users' paid Google Gemini API keys (`scryboard:gemini-key`), GM tokens (`scryboard:gm:<roomId>`), and player secrets are stored in `localStorage`, but HTML responses served by `server.ts` include no `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`, or `Strict-Transport-Security` headers.
  - Without `X-Frame-Options: DENY` or `frame-ancestors 'none'`, a malicious site can frame `/r/<roomId>` and use clickjacking against a GM whose token is already stored in `localStorage`.
  - `server.on("upgrade", ...)` in `server.ts` does not verify the `Origin` header, allowing cross-origin websites to open WebSocket connections to `/collab` from a visitor's browser.
- **Remediation**: Add `Content-Security-Policy` (`default-src 'self'; connect-src 'self' wss: https://generativelanguage.googleapis.com; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer` middleware in `server.ts`, and validate the `Origin` header on WebSocket upgrades.

---

## 4. Low & Informational Findings

- **L-1. Docker Container Runs as `root` & Hardcoded GCP Project in Deploy Script**
  - [`Dockerfile`](../Dockerfile) (lines 12–34) does not switch to a non-root user (`USER node`) in the `runtime` stage. Ensure `/data` ownership is set in `docker-entrypoint.sh` or image build and run the server as a non-root user.
  - [`scripts/deploy-cloud-run.sh`](../scripts/deploy-cloud-run.sh) (lines 25–69) hardcodes a default GCP project (`gen-lang-client-0514761082`) and grants `roles/storage.objectAdmin` at bucket level.
- **L-2. Unescaped `_` Wildcard and Orphaned `scenes` Rows in `pruneInactiveRooms`**
  - In [`pruneInactiveRooms`](../apps/server/src/rooms/prune.ts) (lines 21–29), `like(documents.name, 'room:${id}:%')` uses SQL `LIKE`, where `_` (valid in `base64url` room IDs) is a single-character wildcard and ASCII matching is case-insensitive in SQLite. Use `GLOB 'room:${id}:*'` instead.
  - `pruneInactiveRooms` deletes from `documents`, `players`, `assets`, and `rooms`, but omits `tx.delete(scenes).where(eq(scenes.roomId, id)).run()`, leaving orphaned scene rows in SQLite.
- **L-3. Missing Rate Limit on `/gm-check` & Asset Visibility Ordering in `ArchiveService.import`**
  - [`POST /api/rooms/:id/gm-check`](../apps/server/src/http/app.ts) (lines 179–183) does not validate `ROOM_ID_PATTERN` before querying SQLite and has no rate limiter.
  - In [`ArchiveService.import`](../apps/server/src/rooms/archive.ts) (lines 250–260), `this.assets.put(room.id, bytes)` writes asset files before `this.access.recordUpload(room.id, stored, true)` records `public: false` in the `assets` table. Because [`AssetAccess.canRead`](../apps/server/src/assets/access.ts) (line 48) returns `true` when `!row` (`if (!row || row.public) return true;`), call `access.recordUpload` _before_ `assets.put`.
