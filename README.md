# Scryboard

Whiteboard collaborativa per sessioni di gioco di ruolo online: il GM condivide mappe e
informazioni e decide cosa vedono i giocatori. Perimetro, architettura e piano di lavoro sono in
[docs/MVP.md](docs/MVP.md).

## Struttura

```
apps/server       Node: API HTTP (Hono) + sincronizzazione Yjs (Hocuspocus) + SQLite (Drizzle)
apps/web          React + Vite
packages/shared   Tipi e schemi condivisi tra client e server
```

## Requisiti

- Node.js 24 (`.nvmrc`)
- pnpm, attivabile con Corepack: `corepack enable pnpm`
  (se non hai i permessi su `/usr/bin`: `corepack enable --install-directory ~/.local/bin pnpm`)

## Sviluppo

```bash
pnpm install
pnpm dev
```

Apri http://localhost:5173. Vite inoltra `/api` e il WebSocket `/collab` al server sulla porta
3000. La configurazione del server si legge da `apps/server/.env` (vedi `.env.example`); il
database di sviluppo finisce in `apps/server/data/`.

| Comando          | Cosa fa                                 |
| ---------------- | --------------------------------------- |
| `pnpm dev`       | Server e web app in modalità watch      |
| `pnpm test`      | Test di tutti i pacchetti (Vitest)      |
| `pnpm typecheck` | Controllo dei tipi                      |
| `pnpm lint`      | Lint e formattazione (Biome)            |
| `pnpm format`    | Applica le correzioni di Biome          |
| `pnpm build`     | Build di produzione di server e web app |

Dopo aver modificato `apps/server/src/db/schema.ts`, genera la migrazione con
`pnpm --filter @scryboard/server db:generate`.

Per i test end-to-end serve Chromium, da installare una volta con
`pnpm exec playwright install chromium`. In locale la suite gira su Chromium; con
`ALL_BROWSERS=1 pnpm e2e` anche su Firefox e WebKit (come in CI).

## Scorciatoie della lavagna

| Tasto                                  | Azione                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| V H P L R O T E K                      | Seleziona, mano, matita, linea, rettangolo, ellisse, testo, gomma, token     |
| Alt (trascinando un token)             | Muove senza griglia; solo il GM ignora anche i muri                          |
| B (solo GM)                            | Terreno: dipinge i biomi a pennello o come regioni, con gomma                |
| J (solo GM)                            | Percorso: strade e fiumi a clic o a mano libera; [ e ] cambiano la larghezza |
| W (solo GM)                            | Muri, porte, finestre e barriere invisibili agganciati alla griglia          |
| Doppio clic su un percorso selezionato | Aggiunge un punto di controllo                                               |
| F (solo GM)                            | Nebbia: copri o scopri con rettangolo, poligono o pennello                   |
| Shift+H (solo GM)                      | Nasconde ai giocatori la selezione, o la rivela                              |
| Spazio (tenuto premuto)                | Sposta la vista con qualsiasi strumento                                      |
| Rotella / pinch                        | Zoom                                                                         |
| Shift+1 / Shift+0                      | Adatta al contenuto / zoom 100%                                              |
| Canc / Backspace                       | Elimina la selezione                                                         |
| ] / [                                  | Porta in primo piano / sullo sfondo                                          |
| Ctrl+Z / Ctrl+Shift+Z                  | Annulla / ripeti                                                             |
| Esc                                    | Deseleziona, chiude l'editor di testo                                        |
| Clic prolungato                        | Ping visibile a tutti                                                        |
| Trascinare su uno spazio vuoto         | Selezione a riquadro (con Shift si aggiunge)                                 |

Le immagini si aggiungono con il pulsante della barra, trascinandole sulla lavagna o incollandole.
Quelle del GM finiscono sul livello mappa, che i giocatori non possono modificare.

Il GM attiva la griglia dal pulsante dedicato e la calibra tracciando un riquadro su una casella
della mappa. I token si agganciano alle caselle; il GM può bloccare qualsiasi oggetto, e finché è
bloccato nessuno può spostarlo o cancellarlo.

Il GM può dipingere il terreno con 13 biomi (erba, foresta, roccia, sabbia, acqua, lava…), a
pennello o come regioni dai bordi morbidi; le texture sono generate nel browser e ogni pennellata
arriva subito ai giocatori.

Con lo strumento Percorso il GM traccia sentieri, strade sterrate o lastricate, ruscelli e fiumi:
la curva passa per i punti cliccati, ogni punto ha la sua larghezza e i corsi d'acqua si
assottigliano alle estremità. Selezionando un percorso se ne trascinano i punti.

Con lo strumento Muri il GM disegna polilinee agganciate agli incroci della griglia (Alt le lascia
libere), porte, finestre e muri invisibili. Può anche generare i muri dal contorno di un bioma.
I muri fermano i token trascinati; i giocatori vedono solo le icone delle porte e possono aprire o
chiudere quelle non chiuse a chiave. Selezionando un muro il GM ne modifica i vertici o lo elimina.

Il GM può nascondere qualsiasi oggetto ai giocatori (o crearlo già nascosto): gli oggetti nascosti
e le loro immagini non arrivano proprio ai browser dei giocatori. La nebbia copre mappa e token;
il GM la vede semitrasparente, i giocatori opaca.

## Produzione

```bash
docker build -t scryboard .
docker run -p 3000:3000 -v scryboard-data:/data scryboard
```

Il container serve API, WebSocket e web app sulla porta 3000 e salva database e immagini in
`/data`. Istruzioni per Fly.io, per una VPS con Docker Compose e per la pulizia delle stanze
inattive in [docs/DEPLOY.md](docs/DEPLOY.md).

## Come funzionano le stanze

- Chi crea una stanza diventa GM e riceve un link con il token segreto nel frammento dell'URL
  (`/r/<id>#gm=<token>`), che il browser non invia mai al server nelle richieste HTTP.
- Il link senza frammento è quello da dare ai giocatori.
- Ogni stanza ha due documenti Yjs: `room:<id>:public` per tutti e `room:<id>:gm`, a cui il
  server dà accesso solo con il token GM. Gli oggetti nascosti vivranno nel secondo (milestone M3).
