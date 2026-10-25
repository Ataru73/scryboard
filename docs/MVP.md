# Scryboard — MVP e stack tecnico

Whiteboard collaborativa per sessioni di gioco di ruolo **online**: il GM condivide mappe e
informazioni e decide in ogni momento cosa vedono i giocatori.

## Principi

- **Zero attrito per i giocatori**: si entra da un link, si sceglie un nome, si gioca. Nessun account.
- **Il GM controlla la visibilità**: ciò che è nascosto non arriva proprio al browser dei giocatori.
- **Whiteboard prima di VTT**: niente automazione di regole; strumenti generici che vanno bene per
  qualunque sistema.

## Perimetro dell'MVP (v0.1)

### Stanze e ruoli

- Creazione di una stanza → due link: **link GM** (con token segreto) e **link giocatori**.
- I giocatori entrano con un nome e un colore; il GM vede chi è connesso.
- Una stanza = una board (le scene multiple arrivano nella v0.2).

### Canvas

- Canvas infinito con pan (trascinamento / barra spaziatrice) e zoom (rotella / pinch).
- Tre livelli fissi, dal basso verso l'alto: **Mappa**, **Token**, **Disegno**. Il livello Mappa
  è modificabile solo dal GM.
- Upload di immagini via drag&drop o incolla dagli appunti (PNG, JPG, WebP; max 20 MB).
- Selezione, spostamento, ridimensionamento, rotazione, eliminazione, ordine sullo stesso livello.
- Annulla/ripeti per le proprie azioni.

### Griglia

- Griglia quadrata attivabile per board, con dimensione e offset regolabili.
- Calibrazione rapida: il GM traccia un riquadro su una casella della mappa importata.
- Snap dei token al centro delle caselle (disattivabile con Alt).

### Disegno e testo

- Matita a mano libera, linea, rettangolo, ellisse, testo, gomma.
- Tavolozza colori e spessore del tratto.
- **Ping**: clic prolungato → cerchio animato visibile a tutti per pochi secondi.
- Cursori degli altri utenti visibili con il loro nome.

### Token

- Token da immagine o cerchio colorato con iniziali; nome mostrato sotto.
- I giocatori possono muovere qualunque token non bloccato; il GM può bloccarli.

### Visibilità (funzionalità chiave)

- Ogni oggetto del GM può essere **nascosto** o **visibile**. Gli oggetti nascosti sono mostrati
  al GM semitrasparenti e **non vengono inviati ai giocatori**.
- Rivelare / nascondere con un clic o una scorciatoia (Shift+H; H è lo strumento mano).
- **Fog of war statico**: il GM copre aree (rettangolo, poligono, pennello) e le rivela con gli
  stessi strumenti. Il GM vede la nebbia semitrasparente, i giocatori opaca.
- Pulsante "copri tutta la mappa" all'importazione.

### Persistenza

- Salvataggio automatico continuo; riaprendo il link si ritrova la board com'era.
- Le stanze inattive da 90 giorni vengono archiviate.

### Fuori dall'MVP (v0.2 e successive)

Scene multiple e "porta tutti qui", handout con chiusura temporizzata, pin con note segrete,
righello e aree d'effetto, lancio dadi, griglia esagonale, libreria asset, tracker iniziativa,
export PNG/PDF, fog dinamico con muri, plugin, account utente.

**Da implementare: lingue.** L'interfaccia oggi è solo in italiano, con i testi scritti direttamente
nel codice. Bisogna supportare **italiano e inglese**: estrarre i testi in cataloghi di traduzione,
scegliere la lingua (dal browser, con possibilità di cambiarla) e tradurre anche i messaggi di errore
del server mostrati agli utenti, le etichette dei dati condivisi (biomi, taglie, timbri, luci…) e i
formati di data e ora.

### Criteri di accettazione dell'MVP

1. Un GM e 6 giocatori su browser diversi vedono le modifiche altrui in meno di 200 ms.
2. Un oggetto nascosto non compare nel traffico di rete di un giocatore (verificato con test E2E).
3. Una mappa da 8000×8000 px resta fluida (≥ 50 fps) durante pan e zoom su un portatile medio.
4. Chiudere e riaprire il browser ripristina lo stato esatto della board.
5. Funziona sulle ultime due versioni di Chrome, Firefox, Safari, Edge (desktop).

Verifica (M4):

| #   | Esito                                         | Come                                                                                                                                                                      |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ✅ mediana 0,8 ms, p95 1,2 ms in locale       | `apps/server/test/latency.test.ts`: GM + 6 giocatori, 20 modifiche. Esclude la latenza di rete reale                                                                      |
| 2   | ✅                                            | `e2e/polish.spec.ts`: il nome di un token nascosto non compare mai nei frame WebSocket del giocatore, nemmeno alla sincronizzazione iniziale; compare appena lo si rivela |
| 3   | ✅~60 fps                                     | `pnpm e2e:perf`: pan su una mappa 8000×8000 a zoom 100% e a mappa intera, Chromium headless                                                                               |
| 4   | ✅                                            | Test E2E con ricaricamento e test di persistenza al riavvio del server                                                                                                    |
| 5   | ✅ Chromium e Firefox in locale, WebKit in CI | Edge usa Chromium; WebKit è il motore di Safari                                                                                                                           |

## Stack tecnico

| Area             | Scelta                                                                                      | Motivo                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Linguaggio       | **TypeScript** ovunque                                                                      | Tipi condivisi tra client e server (modello dati, messaggi)                                               |
| Monorepo         | **pnpm workspaces**                                                                         | `apps/web`, `apps/server`, `packages/shared`                                                              |
| Frontend         | **React 19 + Vite**                                                                         | Ecosistema maturo, avvio rapido                                                                           |
| Canvas           | **Konva (react-konva)**                                                                     | Canvas 2D con livelli, hit detection, trasformazioni e caching; licenza MIT                               |
| Stato UI         | **Zustand**                                                                                 | Strumento attivo, selezione, preferenze locali                                                            |
| Sincronizzazione | **Yjs** (CRDT)                                                                              | Merge automatico delle modifiche concorrenti, annulla/ripeti per utente, funziona anche con riconnessioni |
| Server realtime  | **Hocuspocus** (Node)                                                                       | Server WebSocket per Yjs con hook di autenticazione e persistenza                                         |
| API HTTP         | **Hono** sullo stesso processo Node                                                         | Creazione stanze, upload immagini                                                                         |
| Database         | **SQLite** (via Drizzle ORM), migrabile a Postgres                                          | Metadati stanze e snapshot Yjs; zero manutenzione all'inizio                                              |
| Immagini         | Su disco del server (cartella `ASSETS_DIR`); storage **S3-compatibile** (R2) quando servirà | Le immagini non passano dal canale realtime; id = hash del contenuto, cache immutabile                    |
| Test             | **Vitest** + **Playwright** (multi-browser)                                                 | Unit sul modello dati, E2E con GM e giocatore in parallelo                                                |
| Deploy           | Un container Docker su **Fly.io** o una VPS Hetzner                                         | Un solo processo stateful, costo di pochi euro al mese                                                    |

### Alternative scartate

- **tldraw SDK / Excalidraw**: ottimi editor, ma il modello "tutti vedono lo stesso documento"
  rende difficile nascondere davvero gli oggetti ai giocatori; tldraw inoltre richiede una
  licenza commerciale per l'uso in produzione senza watermark (da verificare).
- **Liveblocks / servizi gestiti**: veloci da integrare, ma costo per utente attivo e lock-in.
- **Socket.io con sincronizzazione fatta a mano**: significherebbe reinventare la risoluzione dei
  conflitti e l'annulla/ripeti che Yjs già offre.
- **PixiJS / WebGL**: più prestazioni, ma più lavoro per testo e interazioni; da riconsiderare
  solo se Konva non regge (es. per il fog dinamico).

## Architettura

```
 Browser GM ──┐                        ┌── doc "public"  (tutti)
              ├── WebSocket ── Hocuspocus ┤
 Browser PG ──┘   (auth hook)          └── doc "gm"      (solo GM)
                       │
                  Hono API ── SQLite (stanze, snapshot)
                       └──── R2/MinIO (immagini)
```

### Visibilità garantita dal server: due documenti per stanza

- Ogni stanza ha due documenti Yjs: `room:<id>:public` e `room:<id>:gm`.
- I giocatori possono connettersi **solo** al documento pubblico; l'hook `onAuthenticate`
  rifiuta l'accesso al documento GM senza il token GM.
- Un oggetto nascosto vive nel documento GM. **Rivelarlo** = spostarlo nel documento pubblico;
  **nasconderlo** = l'operazione inversa. Il client del GM mostra l'unione dei due documenti.
- Le immagini caricate dal GM nascono private: il GM le scarica con il suo token nell'header
  `Authorization`, i giocatori solo quando un oggetto che le usa è nel documento pubblico (il
  server controlla il documento al momento della richiesta). Quelle caricate dai giocatori sono
  pubbliche.
- Limite noto: il fog statico copre la mappa solo visivamente, e un giocatore esperto potrebbe
  scaricare l'immagine completa della mappa. Accettabile per l'MVP; più avanti il server potrà
  generare una versione mascherata della mappa.

### Modello dati (bozza)

```ts
type Layer = "map" | "token" | "draw";

interface BaseItem {
  id: string;
  layer: Layer;
  x: number;
  y: number;
  rotation: number;
  z: string; // fractional index per l'ordinamento
  locked: boolean;
  createdBy: string; // id della sessione utente
}

type Item =
  | (BaseItem & { kind: "image"; assetId: string; w: number; h: number })
  | (BaseItem & { kind: "token"; name: string; color: string; assetId?: string; size: number })
  | (BaseItem & { kind: "stroke"; points: number[]; color: string; width: number })
  | (BaseItem & {
      kind: "shape";
      shape: "rect" | "ellipse" | "line";
      w: number;
      h: number;
      stroke: string;
      fill?: string;
    })
  | (BaseItem & { kind: "text"; text: string; fontSize: number; color: string });

interface FogOp {
  // applicate in ordine
  id: string;
  mode: "cover" | "reveal";
  shape: "rect" | "polygon" | "brush";
  points: number[];
  width?: number; // per il pennello
}

interface BoardSettings {
  grid: { enabled: boolean; size: number; offsetX: number; offsetY: number; color: string };
}
```

Nei documenti Yjs: `Y.Map<Item>` per gli oggetti, `Y.Array<FogOp>` per il fog (solo nel doc
pubblico, scrivibile solo dal GM), `Y.Map` per le impostazioni. Cursori, ping e presenza passano
dall'_awareness_ di Yjs e non vengono salvati.

### Permessi lato server

Un giocatore non può modificare il livello Mappa, la nebbia, le impostazioni o gli oggetti
bloccati. Un aggiornamento Yjs non si può rifiutare senza chiudere la connessione (e il client lo
rimanderebbe a ogni riconnessione), quindi il server lo applica e subito dopo ripristina i valori
precedenti con una propria transazione (`apps/server/src/collab/guard.ts`): tutti i client
convergono allo stato corretto. Per questo la nebbia è una Y.Map (id → operazione) e non un
array: con le mappe il server conosce sempre il valore precedente.

## Piano di lavoro

Note sulla M1: annulla/ripeti e i test E2E (Playwright) sono stati anticipati dalla M4; le immagini
per ora si salvano sul disco del server, con un'interfaccia (`AssetStore`) pronta per uno storage
S3. Il server non valida ancora i contenuti dei documenti: arriva con i permessi nella M3.

Note sulla M2: il blocco vale per tutti, GM compreso (il GM lo toglie dal pannello di selezione);
i token hanno l'origine nel centro e il diametro in caselle, così seguono la griglia quando la si
ricalibra; un elenco testuale nascosto dei token con la loro casella rende la lavagna usabile
anche con uno screen reader.

Note sulla M3: il GM può creare oggetti già nascosti (pulsante con l'occhio nella barra); l'annulla
copre anche le azioni che toccano entrambi i documenti, come nascondere un oggetto; dopo il
caricamento di una mappa il GM può coprirla di nebbia con un clic.

Note sulla M4: ping con clic prolungato, selezione a riquadro, trascinamento di selezioni miste
(forme e token), tratti visibili agli altri mentre si disegnano (ma non quelli creati nascosti dal
GM); lato server limiti di frequenza su creazione stanze e upload, ultima attività delle stanze e
comando di pulizia manuale; configurazione per Fly.io e Docker Compose in `docs/DEPLOY.md`.

| Milestone                | Contenuto                                                                                 | Stima           |
| ------------------------ | ----------------------------------------------------------------------------------------- | --------------- |
| M0 – Fondamenta ✅       | Monorepo, CI, Hocuspocus + Hono, creazione stanza e link                                  | 3–4 giorni      |
| M1 – Canvas condiviso ✅ | Pan/zoom, upload immagini, disegno, testo, cursori, persistenza, annulla/ripeti, test E2E | 1–1,5 settimane |
| M2 – Token e griglia ✅  | Token, griglia, calibrazione, snap, blocco                                                | 4–5 giorni      |
| M3 – Visibilità ✅       | Doppio documento, nascondi/rivela, fog statico, permessi server                           | 1–1,5 settimane |
| M4 – Rifinitura ✅       | Ping, selezione a riquadro, rifiniture, deploy                                            | 1 settimana     |

Totale indicativo: **5–6 settimane** di lavoro per una persona.
