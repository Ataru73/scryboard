# Scryboard — Piano: strumenti da tavolo (misure, scene, turni, dadi)

Obiettivo: colmare le lacune che si sentono **in ogni sessione** (misurare, aree d'effetto,
cambiare scena, sapere di chi è il turno) senza tradire i principi di `MVP.md`: niente schede
personaggio, niente regole automatiche, solo strumenti generici validi per qualunque sistema.

Il piano parte da un'analisi esterna in 12 punti; confrontata con il codice, alcune voci sono già
coperte e il perimetro si riduce:

| Voce dell'analisi           | Stato nel codice                                                                                                                                                                                      | Decisione                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 2. Porte interattive        | Già fatte: `kind: "door"` in `walls.ts` con stato `open/closed/locked`, icona cliccabile in `WallLayer.tsx`, apertura dei giocatori controllata da `guard.ts` (`canPlayerToggleDoor`, `isDoorFogged`) | **Esclusa**                                                          |
| 7. Ping                     | Già fatto: clic prolungato → awareness `ping` → `Presence.tsx`                                                                                                                                        | Restano solo **freccia fuori schermo** e **"porta qui i giocatori"** |
| 9. Finestre / muri speciali | Esistono `window` e `invisible`                                                                                                                                                                       | Restano **muri a senso unico** e **muri di terreno**                 |
| 12. Mappe animate           | Gli asset sono solo immagini (`ASSET_MIME_TYPES`)                                                                                                                                                     | Confermata, in fondo                                                 |

## Principi

- **Ciò che è nascosto non arriva ai giocatori**: ogni nuovo dato che riguarda oggetti nascosti
  (turni, attacchi, scene in preparazione) sta nel documento del GM o in documenti a cui il server
  non dà accesso ai giocatori.
- **Il server è l'arbitro**: ogni nuova Y.Map del documento pubblico ha la sua regola in
  `collab/guard.ts` (chi può scrivere cosa), con test in `apps/server/test/guard.test.ts`.
- **Effimero via awareness, persistente via Yjs**: righello e anteprime viaggiano come il ping
  (`setAwarenessField`); sagome piazzate, turni e tiri sono documenti.
- **Logica pura in `packages/shared`** (distanze, parser dei dadi, aree) con test unitari; il web
  la usa, il server la riusa per validare.

## Ordine delle fasi

Ordinate per valore/costo, non per l'ordine dell'analisi: prima ciò che si usa a ogni tiro e
costa poco, poi il lavoro architetturale (scene), infine le rifiniture.

```
T1 Righello  →  T2 Aree e aure  →  T3 Turni  →  T4 Dadi  →  T5 Ping+  →  T6 Scene
→  T7 Esporta/importa  →  T8 Raccolta asset  →  T9 Cavalcature  →  T10 Muri speciali  →  T11 Video
```

T1–T5 sono indipendenti tra loro. T6 cambia i nomi dei documenti: T7 va fatta **dopo** T6
(l'archivio deve contenere tutte le scene).

---

### T1 — Righello e distanza durante il trascinamento (≈ 1 settimana)

**Stato**: completata, salvo le forme d'area (T2). Note rispetto al piano:
- Il tasto è `M` (`R` è già il rettangolo) e il pulsante sta nella barra dello zoom: la colonna
  degli strumenti riempie già un'altezza di 800 px.
- La logica di misura sta in `apps/web/src/board/measure.ts`, non in `packages/shared`: il
  server non ne ha bisogno e `hex.ts` resta nel web. Il righello e il trascinamento dei token
  pubblicano lo stesso campo awareness `ruler`.
- Il righello sparisce al rilascio; i token nascosti non pubblicano la distanza.
- Scala e diagonali (default 5 ft, "ogni diagonale vale 1") stanno in un riquadro "Righello"
  del pannello Griglia; la distanza misurata è anche in un `role="status"` per gli e2e e gli
  screen reader.

**Cosa vede l'utente**
- Strumento **Righello** (tasto `R`, per tutti): si trascina, si vedono segmento e distanza
  (es. "30 ft · 6 caselle"). `Spazio` durante il trascinamento aggiunge una tappa; `Esc`
  annulla. Gli altri vedono il righello in tempo reale, nel colore di chi misura.
- Trascinando un token compare un'etichetta con la distanza percorsa dalla casella di partenza
  (anche qui `Spazio` aggiunge tappe).
- Nel pannello Griglia (GM): **scala** (`1 casella = 5 ft`, `1,5 m`…) e **regola diagonali**:
  "5-10-5" (D&D 3.5/PF), "ogni diagonale = 1" (5e), "euclidea". Con gli esagoni la regola non
  serve.

**Come**
- `gridSettingsSchema` + `scale: { amount, unit }` e `diagonals: "alternate" | "one" | "euclid"`,
  facoltativi con `.default()` come già per `type` (le stanze vecchie restano valide).
- `packages/shared/src/measure.ts`: `cellDistance(grid, a, b)` per quadrati (tre regole) e
  esagoni (riuso delle coordinate assiali di `apps/web/src/board/hex.ts`, da spostare nel
  pacchetto condiviso se serve anche al server); `pathDistance(grid, waypoints)` somma i tratti
  sulle caselle agganciate.
- Awareness: campo `ruler: { points: number[] } | null`; disegno in `Presence.tsx` accanto ai
  puntatori. Il trascinamento dei token pubblica lo stesso campo.
- Strumento in `tools.ts`/`Toolbar.tsx`, gesti in `Board.tsx` (la gestione di `Spazio` va
  coordinata con il pan a barra spaziatrice: durante una misura `Spazio` = tappa).
- Test: unitari per le distanze (casi D&D noti), e2e `ruler.spec.ts` con due client.

### T2 — Sagome d'area e aure (≈ 1,5 settimane)

**Stato**: completata. Note rispetto al piano:
- Le forme (cerchio, cono, cubo, raggio) sono modalità dello strumento Righello (`M`).
  Origine sugli incroci, direzioni a 15° e lunghezze intere con la griglia (Alt: libero). Rilasciata,
  la sagoma resta 4 secondi per tutti; con Maiusc diventa un `TemplateItem` sul livello disegno.
- Le sagome fissate si spostano e si cancellano ma non si ridimensionano né ruotano (niente
  Transformer): se ne traccia una nuova. Un token è "toccato" se il suo centro è dentro la
  sagoma; i token che chi guarda non vede non vengono evidenziati.
- Logica in `apps/web/src/board/areas.ts` (non in `packages/shared`, come per T1). L'aura si
  imposta dal pannello di selezione del token, accanto a stile e visione.

**Cosa vede l'utente**
- Nel righello, quattro forme: **linea, cerchio, cono, cubo**. Rilasciando, la sagoma resta
  come anteprima per qualche secondo; con `Shift` (o un pulsante "Fissa") diventa un oggetto
  persistente che si sposta e si cancella come un disegno.
- Le caselle coperte si evidenziano; il token toccato viene contornato.
- Nei campi del token: **aura** (raggio in caselle + colore), disegnata sotto il token e
  visibile a tutti.

**Come**
- Nuovo `templateItemSchema` (`kind: "template"`, livello `draw` così anche i giocatori lo
  creano): `shape`, `size` in caselle, `angle` per cono/linea, `color`. Aggiunta all'unione
  `boardItemSchema` e alle regole di `canModify` in `permissions.ts`.
- `packages/shared/src/areas.ts`: `cellsInArea(grid, template)` con il criterio "centro della
  casella dentro la forma" (lo stesso per quadrati ed esagoni); cono a 53° come in 5e.
- `tokenItemSchema` + `aura: { radius, color }.nullable().optional()`; i campi vanno in
  `TokenStyleFields.tsx`. Non toccano la visione, quindi `visionFields` in `guard.ts` non cambia.
- Rendering: un componente `TemplateNode` in `ItemNode.tsx`; caselle evidenziate con una
  sola `Shape` Konva (non un nodo per casella).

### T3 — Ordine di iniziativa (≈ 1 settimana)

**Stato**: completata. Note rispetto al piano:
- Niente Y.Map `initiative`: il valore sta sul token (`initiative`, assente o null = fuori
  dall'ordine). Un token nascosto sta nel documento del GM e quindi il suo valore non arriva ai
  giocatori, senza una seconda mappa da tenere allineata. Il turno corrente (`activeId`, `round`)
  è in `settings.turn`, scrivibile solo dal GM.
- Il guard permette ai giocatori di cambiare il valore di un token già nell'ordine (come possono
  muovere qualunque token non bloccato), ma non di aggiungerlo o toglierlo. Non si usa `owners`:
  il server non conosce l'id del profilo nelle connessioni.
- Il pannello «Turni» (pulsante nella barra dello zoom, `N` per avanzare) sta in basso a destra;
  il token attivo ha un anello dorato. Il GM ha «Indietro» e «Fine combattimento».
- Correzione collaterale: il pannello di selezione dei token andava a capo con i campi a tutta
  larghezza da quando la T2 vi aveva aggiunto l'aura; ora i campi numerici sono stretti.

**Cosa vede l'utente**
- Pannello flottante **Turni**: il GM aggiunge token (dal menu del token o selezionandoli),
  scrive il valore, riordina, preme **Avanti** (`N`). Il token attivo ha un anello pulsante e
  il riquadro mostra round e prossimo.
- I giocatori vedono la lista (sola lettura) e possono scrivere il valore solo per i token che
  controllano (`owners`).

**Come**
- Y.Map `initiative` nel documento pubblico: `{ entries: { id, tokenId, value }[], activeId,
  round }`. Le voci dei **token nascosti** stanno in una Y.Map omonima del documento GM; il
  pannello del GM le unisce in base a `value`. Quando il turno passa a un token nascosto i
  giocatori vedono solo "Turno del GM".
- Guard: il GM scrive tutto; un giocatore cambia solo `value` delle voci il cui token ha il suo
  profilo in `owners`.
- Cancellando un token si toglie anche la sua voce (nello stesso `transact` di `store.remove`).

### T4 — Dadi e registro pubblico (≈ 1 settimana)

**Cosa vede l'utente**
- Nel pannello Messaggi una scheda **Tavolo**: campo per la formula (`2d20kh1+5`, `8d6`,
  `4d6dl1`) con pulsanti rapidi (d4…d100). I risultati compaiono nel registro e per qualche
  secondo come notifica sulla lavagna.
- Il GM può tirare **di nascosto** (solo lui vede il risultato); `/r` in qualunque chat tira.

**Come**
- `packages/shared/src/dice.ts`: parser (somma di termini `NdM`, `kh/kl/dh/dl`, costanti,
  limite di 100 dadi per formula) con test unitari; restituisce i singoli dadi per mostrarli.
- **Il server tira**, non il browser: `POST /rooms/:id/rolls` (rate limit come `messages`) usa
  `crypto.randomInt` e aggiunge il tiro a un array `rolls` del documento pubblico (scritto solo
  con `GUARD_ORIGIN`, il guard rifiuta le scritture dei client). I tiri nascosti vanno nella
  casella del GM come i messaggi (`collab/messages.ts`).
- Il registro tiene gli ultimi 200 tiri (il server taglia i più vecchi), per non far crescere il
  documento.

### T5 — Ping fuori schermo e "porta qui i giocatori" (≈ 3 giorni)

**Cosa vede l'utente**
- Se un ping cade fuori dalla vista, una freccia sul bordo dello schermo ne indica la direzione;
  cliccandola si centra la vista.
- Il GM, con `Shift` + clic prolungato (o un pulsante nella barra), **porta tutti i giocatori**
  su quel punto con lo zoom attuale.

**Come**
- Freccia: in `Presence.tsx`, `worldToScreen` del ping e intersezione con il bordo.
- Richiamo: campo awareness del GM `summon: { id, x, y, scale }`; i client dei giocatori lo
  applicano una volta per id con un'animazione verso il viewport (`fitBounds`/`zoomAt` in
  `viewport.ts`). Si ignora l'awareness `summon` che non viene da un utente con `role: "gm"`
  (l'awareness non passa dal guard: va accettata solo dal ruolo dichiarato dal server, quindi
  serve esporre il ruolo nella presenza firmata dal server o accettare il rischio che un
  giocatore "trascini" gli altri — da decidere).

### T6 — Scene multiple (≈ 3 settimane)

Già prevista in `MVP.md` ("le scene multiple arrivano nella v0.2"). È la fase più delicata
perché tocca nomi dei documenti, permessi, visibilità degli asset e potatura.

**Cosa vede l'utente**
- Cassetto **Scene** (solo GM): elenco con nome e anteprima, "Nuova scena", rinomina, duplica,
  elimina. Il GM può **aprire** una scena per prepararla mentre i giocatori restano sulla scena
  attiva; un pulsante **"Sposta qui il gruppo"** la rende attiva per tutti.
- I giocatori passano alla nuova scena senza ricaricare la pagina.

**Come**
- Una scena = una coppia di documenti, come oggi la stanza: `room:<id>:scene:<sid>:public` e
  `…:gm`. La scena esistente resta sui nomi attuali (`room:<id>:public`/`gm`), così **non serve
  migrare** i dati: `parseRoomDocumentName` riconosce entrambe le forme.
- Nuovo documento `room:<id>:meta` (letto da tutti, scritto solo dal GM): elenco scene
  `{ id, name, order }` e `activeSceneId`. Le scene non attive non devono trapelare: il nome
  delle scene in preparazione va nella parte GM (`room:<id>:meta-gm`), nel `meta` pubblico c'è
  solo l'id della scena attiva.
- Server (`hocuspocus.ts`, `guard.ts`): un giocatore può connettersi solo ai documenti della
  scena attiva; al cambio di scena il server chiude le connessioni dei giocatori ai documenti
  vecchi. Il guard per scena è identico a quello attuale.
- Asset: `references.ts` cerca l'asset nei documenti pubblici **di tutte le scene** (o almeno
  di quella attiva); `rooms/prune.ts` cancella tutte le scene della stanza.
- Web: `useRoomConnection.ts` riceve l'id della scena e ricrea `BoardStore` al cambio; la
  memoria delle zone esplorate (`vision/explored.ts`) va indicizzata per scena.
- Test: server (accesso negato ai documenti di scene non attive, cambio scena), e2e con GM e
  giocatore che cambiano scena.

### T7 — Esporta e importa la stanza (≈ 1 settimana)

**Cosa vede l'utente**
- Nelle impostazioni del GM: **Esporta** scarica `nome-stanza.scryboard`; nella home,
  **Importa** crea una nuova stanza (nuovi link GM e giocatori) dall'archivio.

**Come**
- `GET /rooms/:id/export` (token del GM): zip (`fflate`) con `manifest.json` (versione del
  formato, nome, elenco scene), lo stato Yjs di ogni documento pubblico/GM/meta
  (`Y.encodeStateAsUpdate`) e gli asset referenziati, letti dallo store (locale o GCS).
  Le caselle di posta **non** si esportano.
- `POST /rooms/import` (rate limit come la creazione): valida il manifest, ricalcola l'hash di
  ogni asset (l'id è lo SHA-256: un archivio manomesso non può sovrascrivere altro), applica
  gli stati ai documenti della nuova stanza, verifica con `boardItemSchema`/`wallSchema` che il
  contenuto sia valido e scarta ciò che non lo è. Limite di dimensione dell'archivio (es.
  200 MB).

### T8 — Raccolta degli asset della stanza (≈ 4 giorni)

**Cosa vede l'utente**
- Nel selettore dei ritratti una scheda **Caricati**: le immagini già caricate nella stanza,
  da trascinare sulla lavagna. Il GM può caricare senza piazzare ("Aggiungi alla raccolta").

**Come**
- `GET /rooms/:id/assets`: per il GM tutte le righe della tabella `assets` della stanza, per i
  giocatori solo quelle pubbliche. Gli asset caricati prima della tabella non compaiono
  (accettabile).
- In `upload.ts` separare "carica" da "piazza".

### T9 — Cavalcature e oggetti agganciati (≈ 1 settimana)

**Cosa vede l'utente**
- Menu del token: **Aggancia a…** (poi clic su un altro token). Spostando il "genitore" si
  spostano anche gli agganciati; un'icona a catena indica il legame. Spostare il figlio da solo
  lo sgancia.

**Come**
- `tokenItemSchema` + `attachedTo: string | null` (solo token; immagini e timbri restano fuori
  per ora). Niente catene: un genitore non può essere agganciato.
- Lo spostamento muove i figli nello stesso `store.update` (anche tra documento pubblico e GM).
- Guard: un giocatore che muove un genitore produce modifiche anche sui figli; sono ammesse se
  i figli non sono bloccati, come se li muovesse uno a uno.

### T10 — Muri a senso unico e di terreno (≈ 1,5 settimane)

**Cosa vede l'utente**
- Due nuovi tipi nel pannello Muri: **Senso unico** (si vede da un lato solo: dirupi,
  sporgenze; una freccia indica il lato trasparente) e **Terreno** (si vede dentro la colonna o
  la collina ma non attraverso).

**Come**
- `barrierSchema.kind` + `"one-way"` e `"terrain"`; per il senso unico il lato trasparente è a
  sinistra della direzione dei punti, con un comando "Inverti".
- `sightSegments` diventa dipendente dall'origine: i muri a senso unico si escludono se
  l'osservatore sta sul lato trasparente (prodotto vettoriale), prima del calcolo nel worker.
- Terreno: `visibilityPolygon` oggi tiene **il primo** ostacolo per raggio; i muri di terreno
  richiedono di tenere **il secondo** muro di terreno colpito. È il pezzo più costoso: misurare
  con `pnpm e2e:perf` e, se rallenta, rinviarlo.

### T11 — Mappe animate (≈ 1 settimana)

**Cosa vede l'utente**
- Si possono caricare video WebM/MP4 come mappa; girano in loop, senza audio.

**Come**
- `ASSET_MIME_TYPES` + `video/webm`, `video/mp4`; `ASSET_ID_PATTERN` di conseguenza; limite di
  dimensione separato per i video (es. 100 MB) — da valutare con i costi del bucket.
- Il server verifica la firma del file (non solo il tipo dichiarato), come per le immagini.
- Web: in `ItemNode.tsx` un `Konva.Image` con un `<video loop muted autoplay playsinline>` e
  un'unica `Konva.Animation` per livello che ridisegna solo se c'è almeno un video visibile.
- Per i muri da Gemini si usa il primo fotogramma.

---

## Rischi e decisioni aperte

- **Scene (T6)**: tenere la scena attuale sui vecchi nomi evita la migrazione ma lascia due
  forme di nome per sempre. In alternativa una migrazione una tantum all'avvio del server.
- **Richiamo dei giocatori (T5)**: l'awareness non è validata dal server; senza un ruolo
  firmato un giocatore potrebbe spostare le viste altrui.
- **Dimensione dei documenti**: registro dei tiri e sagome persistenti fanno crescere il
  documento pubblico; tagli e "Cancella sagome" del GM.
- **Interfaccia**: righello, aree, turni e dadi aggiungono quattro strumenti; vanno raggruppati
  (righello + aree in un unico strumento con sottomodi) per non affollare `Toolbar.tsx`.
