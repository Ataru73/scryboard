# Scryboard

Collaborative whiteboard for online tabletop role-playing sessions: the GM shares maps and
information and decides what the players see. Scope, architecture and work plan are in
[docs/MVP.md](docs/MVP.md) (in Italian).

> Italiano: [README.it.md](README.it.md)

## At a glance

- **Rooms with no accounts**: one link for the GM (with a secret token), one for the players.
- **Infinite whiteboard** with layers, drawing, text, images, undo/redo and live cursors.
- **Square or hex grid** with calibration, a ruler with configurable scale, area templates and auras.
- **Tokens**: a library of ~80 silhouettes, your own images, AI-generated images, attachments
  (mounts), initiative order and turn ring.
- **Painted maps**: 13 biomes, roads and rivers, stamps, fill, copy/paste, or imported images and
  animated video maps.
- **Walls, doors and lights** with dynamic vision, one-way and terrain walls, ambient light.
- **Secrets enforced by the server**: hidden objects, fog of war and private messages never reach
  players' browsers.
- **Multiple scenes** per room: prepare the next one while the players stay in the current one.
- **Dice** rolled by the server, with 2D animations on the whiteboard, a public log and secret GM
  rolls.
- **Export and import** a whole room as a `.scryboard` file.
- **Optional Gemini integration** to generate token images and maps and to trace walls.

## Structure

```
apps/server       Node: HTTP API (Hono) + Yjs sync (Hocuspocus) + SQLite (Drizzle)
apps/web          React + Vite
packages/shared   Types and schemas shared between client and server
```

## Requirements

- Node.js 24 (`.nvmrc`)
- pnpm, which you can enable with Corepack: `corepack enable pnpm`
  (if you don't have permission on `/usr/bin`: `corepack enable --install-directory ~/.local/bin pnpm`)

## Development

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173. Vite forwards `/api` and the `/collab` WebSocket to the server on
port 3000. The server configuration is read from `apps/server/.env` (see `.env.example`); the
development database ends up in `apps/server/data/`.

| Command          | What it does                               |
| ---------------- | ------------------------------------------ |
| `pnpm dev`       | Server and web app in watch mode           |
| `pnpm test`      | Tests for all packages (Vitest)            |
| `pnpm typecheck` | Type checking                              |
| `pnpm lint`      | Lint and formatting (Biome)                |
| `pnpm format`    | Applies Biome's fixes                      |
| `pnpm build`     | Production build of the server and web app |

After changing `apps/server/src/db/schema.ts`, generate the migration with
`pnpm --filter @scryboard/server db:generate`. After pulling server changes, restart the server:
the shared package and the migrations are loaded at startup.

The end-to-end tests need Chromium, which you install once with
`pnpm exec playwright install chromium`. Locally the suite runs on Chromium; with
`ALL_BROWSERS=1 pnpm e2e` it also runs on Firefox and WebKit (as in CI, where each browser runs
in its own job).

## Whiteboard shortcuts

| Key                             | Action                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------- |
| V H P L R O T E K               | Select, hand, pencil, line, rectangle, ellipse, text, eraser, token              |
| M                               | Ruler and area templates (distance, circle, cone, cube, ray)                     |
| Alt (while dragging)            | Moves or draws without the grid; only the GM also ignores walls                  |
| B (GM only)                     | Terrain: paints biomes with a brush or as regions, with an eraser                |
| J (GM only)                     | Path: roads and rivers by clicking or freehand; [ and ] change the width         |
| W (GM only)                     | Walls, doors, windows, invisible, one-way and terrain walls snapped to the grid  |
| I (GM only)                     | Lights, dynamic vision, ambient light and preview as a player                    |
| S (GM only)                     | Stamps: trees, rocks and furniture; drag to scatter many                         |
| N (GM only)                     | Next turn in the initiative order                                                |
| 1–9 (Terrain, Path, Stamps)     | Recent biomes, path styles, stamps                                               |
| Double-click on a selected path | Adds a control point                                                             |
| F (GM only)                     | Fog: cover or reveal with a rectangle, polygon or brush                          |
| Shift+H (GM only)               | Hides the selection from the players, or reveals it                              |
| Space (held down)               | Pans the view with any tool; while measuring, adds a waypoint                    |
| Mouse wheel / pinch             | Zoom                                                                             |
| Shift+1 / Shift+0               | Fit to content / zoom 100%                                                       |
| Del / Backspace                 | Deletes the selection                                                            |
| ] / [                           | Bring to front / send to back                                                    |
| Ctrl+Z / Ctrl+Shift+Z           | Undo / redo                                                                      |
| Esc                             | Deselects, closes the text editor, cancels a measurement or an attachment        |
| Long press                      | Ping visible to everyone (GM with Shift: also summons the players to that point) |
| Dragging on an empty space      | Box selection (hold Shift to add)                                                |

Images are added with the toolbar button, by dragging them onto the whiteboard, or by pasting
them (PNG, JPEG, WebP, GIF, up to 20 MB). The GM's images go on the map layer, which players
cannot edit. Lights (the Light tool) always stay above the maps. The eraser deletes objects and,
for the GM, also walls and doors.

## Table tools

- **Ruler** (`M`): drag to measure; `Space` adds waypoints, `Esc` cancels. Everyone sees the
  measurement in real time in the color of whoever is measuring. The GM sets what one cell is worth
  (5 ft, 1.5 m…) and how diagonals count (every diagonal is 1, alternating 1-2, or straight line)
  from the grid panel. Dragging a token shows the distance it has travelled.
- **Area templates**: the same tool draws circles, cones, cubes and rays that highlight the covered
  cells and outline the tokens they touch. They stay visible for a few seconds; releasing with
  `Shift` pins them as objects that can be moved or deleted.
- **Auras**: any token can have an aura (radius in cells and color) visible to everyone.
- **Dice**: the _Dice_ tab in the sidebar rolls formulas like `2d20kh1+5`, `8d6`, `4d6dl1`
  or `d%`, with quick buttons from d4 to d100. Dice can **explode** (`3d6!` rolls another die for
  every 6; `3d6!5` from 5 up) and a pool can **count successes** (`10d10>=7`, also `>`, `<=`, `<`,
  `=`), alone or together (`8d10!>=8`): the total is then the number of successes. Formulas you
  type can be saved as buttons, kept in your browser. Rolls are made by the server, appear in a public log
  (the last 200) and roll as animated 2D dice at the center of the whiteboard for a few seconds. The GM can roll in secret (the
  result stays in their browser). Typing `/r 1d4` in any conversation rolls for the whole table.
- **Initiative**: the _Turns_ panel (zoom toolbar) lists the tokens in the order; the GM adds them,
  sets their values and moves on with _Next_ (`N`). The active token gets a golden ring; players
  see the order and can edit values. Hidden tokens stay hidden.
- **Pings**: a long press pings everyone. If a ping falls outside your view, an arrow on the screen
  edge points to it and a click centers the view. The GM's _Bring players here_ button (or
  Shift + long press) centers every player's view on the same point.
- **Attachments**: _Attach to…_ in the token's selection panel binds it to another token (a rider
  to a mount): moving the main token moves the attached ones with the same collisions; moving one
  alone detaches it.

## Scenes

A room can hold several scenes (a tavern, a dungeon…). In the sidebar the GM creates, renames,
duplicates and deletes them, and opens one to prepare it while the players stay in the active one
(a banner reminds you which scene you are looking at). _Move the group here_ brings every player to
that scene without reloading. Each scene has its own objects, grid, terrain, walls, dice log and
turns; the players can only open the active scene.

## Export and import

_Export the room_ (Share panel, GM only) downloads a `.scryboard` file with all the scenes, the
hidden objects and the images in use (up to 200 MB); tokens, players and private messages are not
included. _Import a room_ on the home page turns such a file into a new room with new links. The
file is not trusted: only valid data is accepted and images must match their names.

## Generation with Gemini

With a Gemini API key, saved from Settings, three features appear:
- the **Generate** tab of the image library, to create a token's image from a description
  (portrait, top-down view or silhouette);
- the **Generate map** toolbar button, GM only: from a description, a type (dungeon or interior,
  exterior, region map) and a format it produces up to 3 variants; the chosen one is scaled down
  to 2048 px and placed at the center of the view as an image on the map layer;
- the **Trace walls with Gemini** button of the Walls tool, GM only: Gemini reads the largest map
  image (the first frame, for animated maps) and traces its walls, doors and windows, snapped to
  the grid if it is on. It is a starting point to touch up, and a single Ctrl+Z undoes everything.
  The model that reads the images is chosen in Settings; by default it is the most recent "flash"
  model among those available with the key.

Requests are sent from the browser with the user's own key, which stays in their `localStorage`
and never goes through the Scryboard server. Every variant and every analysis is a request
charged to the key's Google account. Without a key the features do not appear.

## Grid, tokens and images

The GM turns the grid on from its dedicated button, chooses whether it is square or hexagonal
(pointy or flat) and calibrates it by tracing a box on one cell of the map (or around one hex).
Tokens snap to the cells; the GM can lock any object, and while it is locked nobody can move or
delete it.

A token can be a colored circle with initials, an uploaded image (cropped to a circle), one of
about 80 silhouettes of the built-in library (searchable by Italian or English name) or a
generated image. The _Uploaded_ tab of the library lists the images already in the room and lets
you add new ones without placing them, to prepare tokens in advance. Tokens come in five sizes;
the GM can assign a token to a player and set its vision, darkvision and carried light.

## Maps, terrain and scenery

The GM can paint the terrain with 13 biomes (grass, forest, rock, sand, water, lava…), with a
brush or as regions with soft edges; the textures are generated in the browser and every stroke
reaches the players immediately.

The Terrain tool also fills areas enclosed by walls or other biomes, copies and pastes portions of
terrain, and can paint "under the fog", to be revealed at the right moment. Stamps add trees,
rocks and furniture, with random rotation and size.

With the Path tool the GM draws trails, dirt or paved roads, streams and rivers: the curve passes
through the clicked points, each point has its own width and watercourses taper at the ends.
Selecting a path lets you drag its points.

Maps can also be **animated**: a WebM or MP4 video (up to 50 MB, GM only) can be used as a map; it
loops without sound for everyone. WebM is the safest format, since MP4/H.264 is not played by
every browser.

## Walls, lights and vision

With the Walls tool the GM draws polylines snapped to the grid intersections (Alt leaves them
free), doors, windows and invisible walls. It can also generate walls from a biome's outline.
Walls stop dragged tokens; players only see the door icons and can open or close the ones that
are not locked. Selecting a wall lets the GM edit its vertices or delete it.

Two special kinds change what can be seen: **one-way walls** (cliffs, ledges) can be seen through
from one side only, shown by arrows that _Reverse direction_ flips; **terrain walls** (pillars,
rocks) do not block sight on their own, but the second one along a line of sight does, so you see
the front face but not the back.

With lights on, the ambient light (day, twilight, night) also changes the colors: the
whiteboard background and the uploaded images become darker and colder at twilight and at night.
(Videos are not tinted.)

With dynamic vision on (Light tool) each player only sees what their tokens see: walls and closed
doors block sight; at night you need lights (fixed or carried by tokens) or darkvision. Areas
already seen stay in half-light. The GM sets the vision, carried light and controlling player of
each token from the selection panel, and can view the whiteboard as a player.

The GM can hide any object from the players (or create it already hidden): hidden objects and
their images never reach the players' browsers at all. The fog covers map and tokens; the GM
sees it semi-transparent, the players opaque.

## Private messages

In the sidebar every participant can write in private: the GM to any player, players to the GM or
to each other. The GM receives a copy of all messages and also reads the conversations between
players (without being able to reply there); the players know it, the panel says so. Each player
has a mailbox that only they can open: the server ties it to the profile id and to a secret that
stays in their browser, and writes messages only into the mailboxes of the sender, the recipient
and the GM. Anyone not involved does not receive them at all.

## Production

```bash
docker build -t scryboard .
docker run -p 3000:3000 -v scryboard-data:/data scryboard
```

The container serves the API, the WebSocket and the web app on port 3000 and stores the database
and images in `/data`. On Google Cloud Run the data can live in a bucket: the database is
replicated with Litestream and the images are saved directly in the bucket (`DATA_BUCKET=<bucket>
scripts/deploy-cloud-run.sh`); the script forces automatic scaling, so the service can scale to
zero. After 10 minutes without activity the clients disconnect, so Cloud Run can shut the
container down; at the first interaction they resume on their own. Instructions for Fly.io, Google
Cloud Run, a VPS with Docker Compose, the rate limits and for cleaning up inactive rooms are in
[docs/DEPLOY.md](docs/DEPLOY.md) (in Italian).

## How rooms work

- Whoever creates a room becomes the GM and gets a link with the secret token in the URL
  fragment (`/r/<id>#gm=<token>`), which the browser never sends to the server in HTTP requests.
- The link without the fragment is the one to give to the players.
- Each scene has two Yjs documents: a public one for everyone and one for the GM, to which the
  server only gives access with the GM token; hidden objects live in the second. The room's first
  scene uses `room:<id>:public` and `room:<id>:gm`, the others `room:<id>:s:<scene>:public` and
  `…:gm`. Players can only open the active scene's public document.
- `room:<id>:meta` is a read-only document written by the server that holds the active scene, and
  each participant has a private mailbox (`room:<id>:mail:<id>`) for messages.
- Dice rolls are written by the server into the scene's public document, so nobody can forge them.
