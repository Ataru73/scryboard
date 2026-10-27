# Scryboard

Whiteboard collaborativa per sessioni di gioco di ruolo online: il GM condivide mappe e
informazioni e decide cosa vedono i giocatori. Perimetro, architettura e piano di lavoro sono in
[docs/MVP.md](docs/MVP.md).

> English: [README.md](README.md)

## In breve

- **Stanze senza account**: un link per il GM (con un token segreto), uno per i giocatori.
- **Lavagna infinita** a livelli, con disegno, testo, immagini, annulla/ripeti e cursori in diretta.
- **Griglia quadrata o esagonale** con calibrazione, righello con scala configurabile, sagome
  d'area e aure.
- **Token**: libreria di circa 80 sagome, immagini proprie, immagini generate con l'IA, aggancio
  (cavalcature), ordine di iniziativa e anello del turno.
- **Mappe dipinte**: 14 biomi, strade e fiumi, timbri, riempimento, copia e incolla, oppure
  immagini importate e mappe animate in video.
- **Muri, porte e luci** con visione dinamica, muri a senso unico e di terreno, luce ambientale.
- **Segreti garantiti dal server**: oggetti nascosti, nebbia e messaggi privati non arrivano mai ai
  browser dei giocatori.
- **Scene multiple** per stanza: si prepara la prossima mentre i giocatori restano in quella attuale.
- **Dadi** tirati dal server, con animazione 2D sulla lavagna, registro pubblico e tiri nascosti del
  GM.
- **Esporta e importa** un'intera stanza in un file `.scryboard`.
- **Integrazione opzionale con Gemini** per generare immagini di token e mappe e tracciare i muri.

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
`pnpm --filter @scryboard/server db:generate`. Dopo aver aggiornato il codice del server,
riavvialo: il pacchetto condiviso e le migrazioni si caricano all'avvio.

Per i test end-to-end serve Chromium, da installare una volta con
`pnpm exec playwright install chromium`. In locale la suite gira su Chromium; con
`ALL_BROWSERS=1 pnpm e2e` anche su Firefox e WebKit. In CI gira su Chromium e Firefox, ognuno
con un job suo.

## Scorciatoie della lavagna

| Tasto                                  | Azione                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| V H P L R O T E K                      | Seleziona, mano, matita, linea, rettangolo, ellisse, testo, gomma, token         |
| M                                      | Righello e sagome d'area (distanza, cerchio, cono, cubo, raggio)                 |
| Alt (trascinando)                      | Muove o disegna senza griglia; solo il GM ignora anche i muri                    |
| B (solo GM)                            | Terreno: dipinge i biomi a pennello o come regioni, con gomma                    |
| J (solo GM)                            | Percorso: strade e fiumi a clic o a mano libera; [ e ] cambiano la larghezza     |
| W (solo GM)                            | Muri, porte, finestre, barriere invisibili, a senso unico e di terreno           |
| I (solo GM)                            | Luci, visione dinamica, luce ambientale e anteprima come un giocatore            |
| S (solo GM)                            | Timbri: alberi, rocce e mobili; trascina per spargerne tanti                     |
| N (solo GM)                            | Turno successivo nell'ordine di iniziativa                                       |
| D                                      | Danno o cura per i token selezionati                                             |
| 1–9 (Terreno, Percorso, Timbri)        | Biomi recenti, stili di percorso, timbri                                         |
| Doppio clic su un percorso selezionato | Aggiunge un punto di controllo                                                   |
| F (solo GM)                            | Nebbia: copri o scopri con rettangolo, poligono o pennello                       |
| Shift+H (solo GM)                      | Nasconde ai giocatori la selezione, o la rivela                                  |
| Spazio (tenuto premuto)                | Sposta la vista con qualsiasi strumento; durante una misura aggiunge una tappa   |
| Rotella / pinch                        | Zoom                                                                             |
| Shift+1 / Shift+0                      | Adatta al contenuto / zoom 100%                                                  |
| Canc / Backspace                       | Elimina la selezione                                                             |
| ] / [                                  | Porta in primo piano / sullo sfondo                                              |
| Ctrl+Z / Ctrl+Shift+Z                  | Annulla / ripeti                                                                 |
| Esc                                    | Deseleziona, chiude l'editor di testo, annulla una misura o un aggancio          |
| Clic prolungato                        | Ping visibile a tutti (il GM con Shift richiama anche i giocatori su quel punto) |
| Trascinare su uno spazio vuoto         | Selezione a riquadro (con Shift si aggiunge)                                     |

Le immagini si aggiungono con il pulsante della barra, trascinandole sulla lavagna o incollandole
(PNG, JPEG, WebP, GIF, fino a 20 MB). Quelle del GM finiscono sul livello mappa, che i giocatori
non possono modificare. Le luci (lo strumento Luce) restano sempre sopra le mappe. La gomma
cancella gli oggetti e, per il GM, anche muri e porte.

## Strumenti da tavolo

- **Righello** (`M`): si trascina per misurare; `Spazio` aggiunge tappe, `Esc` annulla. Tutti vedono
  la misura in tempo reale, nel colore di chi misura. Il GM imposta quanto vale una casella
  (5 ft, 1,5 m…) e come si contano le diagonali (ogni diagonale vale 1, alternate 1-2, o in linea
  retta) dal pannello della griglia. Trascinando un token compare la distanza percorsa.
- **Sagome d'area**: lo stesso strumento disegna cerchi, coni, cubi e raggi che evidenziano le
  caselle coperte e contornano i token toccati. Restano visibili qualche secondo; rilasciando con
  `Shift` si fissano come oggetti da spostare o cancellare.
- **Aure**: ogni token può avere un'aura (raggio in caselle e colore) visibile a tutti.
- **Dadi**: la scheda _Dadi_ della barra laterale tira formule come `2d20kh1+5`, `8d6`, `4d6dl1`
  o `d%`, con pulsanti rapidi da d4 a d100. I dadi possono **esplodere** (`3d6!` tira un altro dado
  per ogni 6; `3d6!5` da 5 in su) e un pool può **contare i successi** (`10d10>=7`, anche `>`, `<=`,
  `<`, `=`), da soli o insieme (`8d10!>=8`): il totale è allora il numero di successi. Le formule
  scritte si salvano come pulsanti, nel tuo browser. I tiri li fa il server, compaiono in un registro
  pubblico (gli ultimi 200) e rotolano con un'animazione 2D al centro della lavagna per qualche
  secondo. Il GM può tirare di nascosto (il risultato resta nel suo browser). Scrivere `/r 1d4` in
  qualunque conversazione tira per tutto il tavolo.
- **Iniziativa**: il pannello _Turni_ (barra dello zoom) elenca i token nell'ordine; il GM li
  aggiunge, scrive i valori e avanza con _Avanti_ (`N`). Il token di turno ha un anello dorato; i
  giocatori vedono l'ordine e possono ritoccare i valori. I token nascosti restano nascosti.
- **Ping**: un clic prolungato fa un ping per tutti. Se un ping cade fuori dalla tua vista, una
  freccia sul bordo dello schermo lo indica e un clic centra la vista. Il pulsante _Porta qui i
  giocatori_ del GM (o Shift + clic prolungato) centra la vista di tutti i giocatori sullo stesso
  punto.
- **Aggancio**: _Aggancia a…_ nel pannello di selezione di un token lo lega a un altro (un
  cavaliere a una cavalcatura): muovendo il principale gli agganciati lo seguono con le stesse
  collisioni; muoverne uno da solo lo sgancia.
- **Punti ferita e condizioni**: il GM dà a un token i punti ferita (attuali, massimi,
  temporanei) e sceglie chi li vede: tutti, i giocatori solo come fascia (illeso, ferito,
  malconcio, a terra) o solo il GM; i numeri segreti non arrivano mai ai giocatori. Una barra sotto
  il token li mostra. _Danno o cura_ (`D`) accetta `-7` o `+5`, anche su più token insieme, e
  consuma prima i temporanei. Le condizioni (prono, avvelenato… o personalizzate) sono icone sul
  token e possono durare un certo numero di round, che scendono all'inizio del turno del token.
- **Schermo al tavolo**: il _Link per lo schermo al tavolo_ (pannello Condividi) apre la lavagna
  su una TV o un proiettore come la vedono i giocatori, senza comandi: segue i token del gruppo e
  il _Porta qui i giocatori_ del GM, mostra di chi è il turno e non si disconnette per inattività.
  Con la visione dinamica mostra ciò che vede tutto il gruppo; il GM può vederlo in anteprima da
  _Vista_ nel pannello delle luci.

## Scene

Una stanza può contenere più scene (una taverna, un dungeon…). Dalla barra laterale il GM le crea,
rinomina, duplica ed elimina, e ne apre una per prepararla mentre i giocatori restano in quella
attiva (un banner ricorda quale scena si sta guardando). _Sposta qui il gruppo_ porta tutti i
giocatori in quella scena senza ricaricare. Ogni scena ha i propri oggetti, griglia, terreno, muri,
registro dei tiri e turni; i giocatori possono aprire solo la scena attiva.

## Esporta e importa

_Esporta la stanza_ (pannello Condividi, solo GM) scarica un file `.scryboard` con tutte le scene,
gli oggetti nascosti e le immagini usate (fino a 200 MB); token, giocatori e messaggi privati non
sono inclusi. _Importa una stanza_ nella home trasforma un file così in una stanza nuova, con nuovi
link. Il file non è considerato affidabile: si accettano solo dati validi e le immagini devono
corrispondere ai loro nomi.

## Generazione con Gemini

Con una chiave API di Gemini, salvata dalle Impostazioni, compaiono tre funzioni:
- la scheda **Genera** della libreria di immagini, per creare l'immagine di un token da una
  descrizione (ritratto, vista dall'alto o sagoma);
- il pulsante **Genera mappa** della barra, solo per il GM: da una descrizione, un tipo (dungeon
  o interno, esterno, mappa di una regione) e un formato produce fino a 3 varianti; quella scelta
  viene ridotta a 2048 px e messa al centro della vista come immagine del livello mappa;
- il pulsante **Traccia muri con Gemini** dello strumento Muri, solo per il GM: Gemini legge
  l'immagine di mappa più grande (il primo fotogramma, per le mappe animate) e ne traccia muri,
  porte e finestre, agganciati alla griglia se è attiva. È un punto di partenza da ritoccare, e un
  solo Ctrl+Z annulla tutto. Il modello che legge le immagini si sceglie nelle Impostazioni; di
  default è il modello "flash" più recente tra quelli disponibili con la chiave.

Le richieste partono dal browser con la chiave dell'utente, che resta nel suo `localStorage` e non
passa mai dal server di Scryboard. Ogni variante e ogni analisi sono richieste addebitate sul conto
Google della chiave. Senza chiave le funzioni non compaiono.

## Griglia, token e immagini

Il GM attiva la griglia dal pulsante dedicato, sceglie se quadrata o esagonale (a punta o piatta)
e la calibra tracciando un riquadro su una casella della mappa (o attorno a un esagono). I token si
agganciano alle caselle; il GM può bloccare qualsiasi oggetto, e finché è bloccato nessuno può
spostarlo o cancellarlo.

Un token può essere un cerchio colorato con le iniziali, un'immagine caricata (ritagliata a
cerchio), una delle circa 80 sagome della libreria (si cercano per nome italiano o inglese) o
un'immagine generata. La scheda _Caricati_ della libreria elenca le immagini già nella stanza e
permette di aggiungerne altre senza piazzarle, per preparare i token in anticipo. I token hanno
cinque taglie; il GM può assegnare un token a un giocatore e impostarne visione, scurovisione e
luce portata.

## Mappe, terreno e scenario

Il GM può dipingere il terreno con 14 biomi (erba, foresta, roccia, sabbia, acqua, legno, lava…), a
pennello o come regioni dai bordi morbidi; le texture sono generate nel browser e ogni pennellata
arriva subito ai giocatori.

Lo strumento Terreno riempie anche le aree chiuse da muri o da altri biomi, copia e incolla porzioni
di terreno e può dipingere "sotto la nebbia", da rivelare al momento giusto. I timbri aggiungono
alberi, rocce e mobili, con rotazione e taglia casuali.

Con lo strumento Percorso il GM traccia sentieri, strade sterrate o lastricate, ruscelli e fiumi:
la curva passa per i punti cliccati, ogni punto ha la sua larghezza e i corsi d'acqua si
assottigliano alle estremità. Selezionando un percorso se ne trascinano i punti.

Le mappe possono essere anche **animate**: un video WebM o MP4 (fino a 50 MB, solo GM) si usa come
mappa e gira in loop e senza audio per tutti. WebM è il formato più sicuro, perché MP4/H.264 non è
riprodotto da tutti i browser.

## Muri, luci e visione

Con lo strumento Muri il GM disegna polilinee agganciate agli incroci della griglia (Alt le lascia
libere), porte, finestre e muri invisibili. Può anche generare i muri dal contorno di un bioma.
I muri fermano i token trascinati; i giocatori vedono solo le icone delle porte e possono aprire o
chiudere quelle non chiuse a chiave. Selezionando un muro il GM ne modifica i vertici o lo elimina.

Due tipi speciali cambiano ciò che si vede: i **muri a senso unico** (dirupi, sporgenze) si
attraversano con lo sguardo da un lato solo, indicato da frecce che _Inverti il verso_ scambia; i
**muri di terreno** (colonne, rocce) non fermano la vista da soli, ma il secondo lungo la linea di
vista sì, così si vede la faccia davanti e non il retro.

Con le luci attive, la luce ambientale (giorno, crepuscolo, notte) cambia anche i colori: lo
sfondo della lavagna e le immagini caricate si fanno più scuri e freddi al crepuscolo e di notte.
(I video non vengono tinti.)

Con la visione dinamica attiva (strumento Luce) ogni giocatore vede solo ciò che vedono i suoi
token: i muri e le porte chiuse fermano la vista; di notte servono luci (fisse o portate dai
token) o scurovisione. Le zone già viste restano in penombra. Il GM imposta visione, luce portata
e giocatore di ogni token dal pannello di selezione e può vedere la lavagna come un giocatore.

Il GM può nascondere qualsiasi oggetto ai giocatori (o crearlo già nascosto): gli oggetti nascosti
e le loro immagini non arrivano proprio ai browser dei giocatori. La nebbia copre mappa e token;
il GM la vede semitrasparente, i giocatori opaca.

## Messaggi privati

Nella barra laterale ogni partecipante può scrivere in privato: il GM a qualunque giocatore, i
giocatori al GM o tra loro. Il GM riceve una copia di tutti i messaggi e legge anche le
conversazioni tra giocatori (senza poter rispondere lì); i giocatori lo sanno, il pannello lo
dice. Ogni giocatore ha una casella di posta che solo lui può aprire: il server la lega all'id del
profilo e a un segreto che resta nel suo browser, e scrive i messaggi soltanto nelle caselle di
mittente, destinatario e GM. Chi non è coinvolto non li riceve nemmeno.

## Produzione

```bash
docker build -t scryboard .
docker run -p 3000:3000 -v scryboard-data:/data scryboard
```

Il container serve API, WebSocket e web app sulla porta 3000 e salva database e immagini in
`/data`. Su Google Cloud Run i dati possono stare su un bucket: il database è replicato con
Litestream e le immagini sono salvate direttamente nel bucket (`DATA_BUCKET=<bucket>
scripts/deploy-cloud-run.sh`); lo script forza lo scaling automatico, così il servizio può scendere
a zero. Dopo 10 minuti senza attività i client si disconnettono, così Cloud Run può spegnere il
container; alla prima interazione riprendono da soli. Istruzioni per Fly.io, Google Cloud Run, per
una VPS con Docker Compose, per i limiti di richieste e per la pulizia delle stanze inattive in
[docs/DEPLOY.md](docs/DEPLOY.md).

## Come funzionano le stanze

- Chi crea una stanza diventa GM e riceve un link con il token segreto nel frammento dell'URL
  (`/r/<id>#gm=<token>`), che il browser non invia mai al server nelle richieste HTTP.
- Il link senza frammento è quello da dare ai giocatori.
- Ogni scena ha due documenti Yjs: uno pubblico per tutti e uno del GM, a cui il server dà accesso
  solo con il token GM; gli oggetti nascosti stanno nel secondo. La prima scena della stanza usa
  `room:<id>:public` e `room:<id>:gm`, le altre `room:<id>:s:<scena>:public` e `…:gm`. I giocatori
  possono aprire solo il documento pubblico della scena attiva.
- `room:<id>:meta` è un documento di sola lettura, scritto dal server, con la scena attiva; ogni
  partecipante ha poi una casella di posta privata (`room:<id>:mail:<id>`) per i messaggi.
- I tiri di dadi li scrive il server nel documento pubblico della scena, quindi nessuno può
  falsificarli.
