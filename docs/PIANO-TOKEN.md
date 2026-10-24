# Scryboard — Piano: libreria di immagini per i token

Obiettivo: dare al GM (e ai giocatori) una **libreria di immagini già pronte** per i token —
mostri e personaggi fantasy classici — da scegliere con un clic, senza dover cercare e caricare
un file per ogni goblin.

Oggi un token è un cerchio colorato con le iniziali, oppure un'immagine caricata nella stanza
(`assetId`). La libreria aggiunge una terza possibilità, accanto alle altre due. In più, chi
inserisce nell'app una propria chiave API di **Gemini** può generare un'immagine su misura
("goblin con l'arco e il cappuccio verde") quando nella libreria manca quella giusta.

## Principi

- **Nessun caricamento**: le immagini della libreria fanno parte dell'app, non degli asset della
  stanza. Non occupano spazio sul server, non servono permessi e funzionano subito anche per i
  token nascosti.
- **Licenze pulite**: solo immagini che si possono ridistribuire dentro un'app open source, con i
  crediti in vista. Nessun nome o creatura protetti (vedi "Contenuti").
- **Leggera**: la libreria si scarica solo quando serve (un chunk separato) e non rallenta
  l'apertura della lavagna.
- **Compatibile**: i token esistenti restano validi; un client vecchio che non conosce la
  libreria mostra le iniziali.

## Fonte delle immagini

| Opzione                                        | Pro                                                                | Contro                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| **Sagome SVG di game-icons.net** (CC BY 3.0)   | Migliaia di icone fantasy, stile uniforme, nitide a ogni zoom, pochi KB l'una, si colorano col colore del token | Monocromatiche, niente ritratti; richiedono l'attribuzione agli autori       |
| Ritratti a colori di pacchetti per VTT         | Belli, "da tavolo"                                                 | Quasi sempre con licenze che vietano la ridistribuzione in un'app (es. Forgotten Adventures, 2-Minute Tabletop) |
| Ritratti CC0 raccolti da varie fonti           | Nessun obbligo di attribuzione                                     | Stili e qualità diversi tra loro, catalogo piccolo, molto lavoro di selezione |
| Immagini generate con l'IA                     | Stile su misura                                                    | Licenza e provenienza discutibili, qualità da controllare a mano            |

**Proposta**: partire dalle **sagome di game-icons.net**. Si sposano con il token attuale (cerchio
del colore scelto, sagoma bianca al posto delle iniziali), quindi lo stesso goblin in rosso o in
verde distingue due gruppi senza altre immagini. I ritratti a colori si possono aggiungere dopo
(fase T4) con lo stesso campo del modello. Prima di importarle si verifica la licenza di ogni
icona scelta: il sito dichiara CC BY 3.0 per tutto il catalogo, con l'autore indicato icona per
icona.

## Contenuti

Circa **80 immagini** al primo rilascio, con nomi in italiano e alias inglesi per la ricerca:
- **Personaggi**: guerriero, mago, ladro, chierico, ranger, bardo, paladino, druido, monaco,
  barbaro, stregone, arciere, cavaliere, popolano, mercante, nobile, guardia.
- **Umanoidi**: goblin, hobgoblin, orco, coboldo, gnoll, uomo lucertola, bandito, cultista,
  pirata, negromante.
- **Non morti**: scheletro, zombi, fantasma, spettro, vampiro, mummia, lich, ghoul.
- **Bestie**: lupo, orso, ragno gigante, ratto, pipistrello, serpente, cinghiale, aquila,
  cavallo, squalo.
- **Draghi e affini**: drago, viverna, pseudodrago, idra.
- **Mostruosità**: troll, ogre, minotauro, basilisco, medusa, arpia, chimera, grifone, manticora,
  orsogufo, mimic, cubo gelatinoso.
- **Altri piani**: demone, diavolo, imp, elementale (fuoco, acqua, aria, terra), angelo, golem.
- **Giganti e folletti**: gigante, ettin, treant, folletto, driade.

Si usano solo nomi generici o presenti nell'SRD 5.1 (CC BY 4.0). Si evitano le creature che
Wizards of the Coast considera di sua esclusiva proprietà (beholder, mind flayer/illithid,
displacer beast, githyanki, slaad…), anche se esiste un'icona simile.

## Modello

Nuovo campo facoltativo sul token, nel documento pubblico:

```ts
/** Immagine della libreria (id del catalogo); usata se non c'è un'immagine caricata. */
portrait: z.string().regex(/^[a-z0-9-]{1,40}$/).nullable().optional(),
```

- Precedenza nel disegno: `assetId` (immagine caricata) → `portrait` (libreria) → iniziali.
- L'id è una stringa, non un `z.enum`: aggiungere immagini al catalogo non rende invalidi i
  documenti, e un id sconosciuto (client più vecchio o immagine rimossa) ricade sulle iniziali.
- **Perché non riusare `assetId`**: `assetId` passa per il controllo di accesso agli asset, per la
  verifica dei riferimenti pubblici e per `ASSET_ID_PATTERN`; mescolarci gli id della libreria
  vorrebbe dire eccezioni in tutti quei punti.
- Il guard del server non cambia: come `assetId`, anche `portrait` lo possono modificare i
  giocatori sui token che controllano. Un test lo conferma.

## Fasi

### T1 — Catalogo e importazione (≈ 2–3 giorni)

- Le SVG scelte si copiano in `assets/portraits/` (cartella versionata, con il file della
  licenza e l'elenco degli autori), ciascuna con un id stabile (`goblin`, `drago`…).
- Uno script (`pnpm portraits`) legge le SVG, estrae il tracciato (`path d`, viewBox 512×512),
  lo semplifica (arrotondamento delle coordinate) e genera `apps/web/src/board/portraits.gen.ts`.
- Il catalogo con i dati (id, etichetta, alias, categoria, taglia suggerita) sta in
  `packages/shared`, come `STAMPS` e `LIGHT_PRESETS`.
- Test: ogni voce del catalogo ha un tracciato e un autore; nessun id duplicato; il file generato
  è aggiornato (lo script in modalità `--check` nella CI).

### T2 — Modello e disegno (≈ 1–2 giorni)

- Campo `portrait` nello schema del token, con test sulla compatibilità (token senza il campo,
  id sconosciuto).
- `TokenContent` in `ItemNode.tsx`: se c'è `portrait` disegna un `Path` di Konva bianco sul
  cerchio colorato, scalato al raggio del token (come il puntatore in `Presence.tsx`).
- I tracciati si caricano con un `import()` dinamico in un chunk a parte, solo quando c'è sulla
  lavagna almeno un token con `portrait` o si apre il selettore; nel frattempo si vedono le
  iniziali. Dimensione stimata: ~300 KB non compressi, ~100 KB con gzip per 80 icone.
- Il colore della sagoma si sceglie per contrasto col colore del token (bianco o quasi nero),
  come per le iniziali.

### T3 — Selettore (≈ 2–3 giorni)

- In `TokenStyleFields`, accanto a "Immagine", un pulsante **Libreria** che apre un pannello con:
  campo di ricerca (nome e alias), schede per categoria, griglia di anteprime con il colore del
  token, riga dei **recenti** (salvati nel browser, come la tavolozza rapida della F5).
- Scegliere un'immagine imposta `portrait`; se il nome è vuoto lo riempie con l'etichetta
  ("Goblin") e propone la taglia suggerita (il drago nasce Enorme). Caricare un'immagine propria
  ha la precedenza; "Togli immagine" toglie entrambe.
- Funziona sia per lo strumento Token (nuovi token) sia per un token selezionato.
- Accessibilità: le anteprime sono pulsanti con il nome come etichetta; la griglia si usa da
  tastiera.
- `TokenList` mostra una piccola anteprima accanto al nome.
- E2E: il GM sceglie "Goblin" dalla libreria, piazza il token, il giocatore lo vede nell'elenco
  dei token con l'anteprima; un token col portrait sconosciuto mostra le iniziali.

### T4 — Rifiniture (≈ 1 giorno, più eventuali ritratti)

- Pagina o finestra **Crediti** (dal menu della stanza e dalla home) con gli autori delle icone e
  la licenza, come richiesto da CC BY.
- Facoltativo: **ritratti a colori** CC0 come seconda serie dello stesso catalogo (`portrait`
  con un id `ritratto-…`), serviti come file statici WebP dell'app con cache lunga.
- Facoltativo: piazzare più token uguali di fila numerandoli ("Goblin 1", "Goblin 2"…).

### T5 — Generazione con Gemini (≈ 3–4 giorni)

Facoltativa e attiva solo se l'utente inserisce una propria chiave API di Gemini: senza chiave
l'app non mostra nulla di questa funzione.

**Cosa vede l'utente**
- Nel pannello Libreria una scheda **Genera**: descrizione libera (precompilata col nome del
  token), uno stile tra pochi preimpostati (ritratto a mezzo busto, vista dall'alto, sagoma come
  la libreria) e il pulsante "Genera". Si ottengono 2–4 varianti; quella scelta diventa
  l'immagine del token.
- Nelle impostazioni (icona nell'intestazione della stanza) un campo **Chiave API di Gemini**,
  con "Prova chiave" e "Dimentica chiave", e l'avviso che le richieste sono addebitate sul conto
  Google di chi ha inserito la chiave.
- Errori chiari: chiave non valida, quota esaurita, richiesta rifiutata dai filtri di Google.

**Come**
- **La chiave resta nel browser**: salvata in `localStorage` (tramite `lib/storage.ts`) su quel
  dispositivo, mai inviata al server di Scryboard né scritta nel documento Yjs. La richiesta parte
  dal browser direttamente verso l'API di Gemini (`generativelanguage.googleapis.com`,
  `models/{modello}:generateContent` con l'header `x-goog-api-key`), che restituisce l'immagine
  in base64. Così il server non diventa un proxy a pagamento e non custodisce segreti altrui.
- Il **modello** di immagini non è scritto nel codice: un valore predefinito (il modello di
  immagini di Gemini attuale al momento dell'implementazione, da verificare nella documentazione
  di Google) modificabile nelle impostazioni, perché i nomi dei modelli cambiano spesso.
- Il **prompt** unisce la descrizione dell'utente a un modello fisso per lo stile scelto:
  soggetto centrato, sfondo uniforme, nessun testo, inquadratura adatta al ritaglio circolare.
- L'immagine scelta si riduce nel browser a 512×512 (canvas, WebP) e si **carica come un normale
  asset della stanza** con `uploadImage`: il token usa `assetId` come oggi, quindi valgono già
  controllo di accesso, token nascosti e salvataggio. Le varianti scartate non si caricano.
- Le immagini generate appartengono alla stanza, non all'app: non entrano nel catalogo e non
  pongono problemi di ridistribuzione. Google vi aggiunge una filigrana invisibile (SynthID).
- Una **cronologia delle generazioni** (gli `assetId` caricati, per stanza, nel browser) permette
  di riusare un'immagine su altri token senza rigenerarla.
- Disponibile anche ai giocatori, ognuno con la propria chiave.
- Test: unità sul costruttore del prompt e sul parsing della risposta (con risposte registrate);
  E2E con l'API di Gemini simulata da `page.route`, senza chiamate reali né chiavi nella CI.

**Limiti e rischi**
- La chiave in `localStorage` è leggibile da qualunque script della pagina: va detto all'utente,
  e conviene usare una chiave dedicata con limiti di spesa. Se in futuro si aggiunge una CSP,
  `connect-src` deve permettere il dominio di Gemini.
- Le descrizioni inviate a Google sono soggette ai suoi termini e filtri; alcune creature
  "spaventose" potrebbero essere rifiutate.
- Variante per chi ospita Scryboard: una chiave lato server (variabile d'ambiente) con un endpoint
  proxy e limite di frequenza per stanza. Più comoda per i giocatori, ma i costi ricadono su chi
  ospita: da valutare dopo.

## Ordine e stime

| Fase | Contenuto              | Stima         | Dipende da |
| ---- | ---------------------- | ------------- | ---------- |
| T1   | Catalogo e importazione | ≈ 2–3 giorni  | —          |
| T2   | Modello e disegno      | ≈ 1–2 giorni  | T1         |
| T3   | Selettore              | ≈ 2–3 giorni  | T2         |
| T4   | Rifiniture             | ≈ 1 giorno    | T3         |
| T5   | Generazione con Gemini | ≈ 3–4 giorni  | T3 (pannello Libreria) |

Totale indicativo: **circa 1,5 settimane** per una persona, esclusi gli eventuali ritratti a
colori; **circa 2,5 settimane** con la generazione tramite Gemini.

## Decisioni da prendere

1. **Stile**: sagome monocromatiche colorate col token (proposta) o ritratti a colori fin
   dall'inizio?
2. **Giocatori**: la libreria è disponibile anche per i giocatori (proposta: sì, come il
   caricamento delle immagini) o solo per il GM?
3. **Quantità**: circa 80 immagini scelte a mano (proposta) o un catalogo molto più ampio, con
   più peso sul chunk e più lavoro di ricerca?
4. **Chiave di Gemini**: solo nel browser di ciascun utente (proposta) o anche una chiave lato
   server per chi ospita Scryboard?
