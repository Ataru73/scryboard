# Scryboard — Piano: punti ferita e condizioni sui token

Obiettivo: sapere **a colpo d'occhio** come sta ogni creatura (ferita, avvelenata, a terra,
concentrata) senza schede esterne né fogli a parte, restando nei principi di `MVP.md`: niente
schede personaggio, niente regole automatiche. Punti ferita e condizioni sono **contatori ed
etichette generici**: valgono per qualunque sistema e Scryboard non ne trae conseguenze (un token
«stordito» si muove come prima, uno a 0 PF resta sulla mappa).

Il piano nasce da un'analisi esterna che proponeva `conditions: string[]` e
`health: { current, max }` sul token, con anelli di stato e una barra vita. Confrontata con il
codice:

| Voce dell'analisi        | Stato nel codice                                                                                         | Decisione                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Barra vita sul token     | Assente: `tokenItemSchema` non ha campi di salute                                                        | **Confermata**, ma i PF esatti dei mostri non devono arrivare ai giocatori (vedi Principi): campo nel documento del GM, come le maschere |
| Condizioni come stringhe | Assente                                                                                                  | **Confermata** con un catalogo di id (etichette tradotte, icone) invece di testo libero; le condizioni personalizzate in S4              |
| Anello radiale di stato  | L'anello è già usato da selezione (tratteggio) e turno (oro, `turn-ring`); gli angoli da catena e incognito | **Modificata**: icone piccole lungo l'arco inferiore e barra sotto il cerchio, per non confondersi con gli anelli esistenti                |

## Principi

- **Ciò che è nascosto non arriva ai giocatori**: i PF esatti di un token con PF segreti stanno
  in una Y.Map `vitals` del documento del GM, per id, come `MASKS_MAP` per l'incognito. Nel
  documento pubblico resta solo una **fascia** (`hpBand`: illeso, ferito, malconcio, a terra),
  scritta dal client del GM nella stessa azione. Lo stesso test di `polish.spec.ts` («il nome di
  un token nascosto non compare mai nei frame WebSocket») va ripetuto per i PF.
- **Il server è l'arbitro**: ogni nuovo campo del token ha la sua regola in `collab/guard.ts`,
  con test in `apps/server/test/guard.test.ts`. Il server non conosce il profilo delle
  connessioni (vedi T3), quindi non si può limitare un giocatore ai «suoi» token: valgono le
  regole già usate per iniziativa e movimento (un giocatore tocca ciò che può già muovere).
- **Il GM decide la struttura, i giocatori i valori**: come per l'iniziativa, solo il GM dà o
  toglie i PF a un token, cambia il massimo e la visibilità; un giocatore cambia i PF attuali e
  temporanei dei token con PF pubblici e mette o toglie condizioni ai token che può muovere.
- **Logica pura in `packages/shared`** (schema, catalogo, calcolo della fascia, regole del guard)
  con test unitari; il web la usa, il server la riusa per validare.
- **Tutti i testi in italiano e inglese**: etichette delle condizioni e dei campi nei cataloghi
  `apps/web/src/i18n/locales/{it,en}`, via `catalogLabel` come per timbri e luci.

## Ordine delle fasi

```
S1 Modello e guard  →  S2 Disegno sul token  →  S3 Pannello e danni rapidi  →  S4 Rifiniture
```

S1 è il prerequisito di tutto. S2 e S3 si possono fare in parallelo una volta fissato lo schema.
S4 è facoltativa e si decide dopo averla usata in qualche sessione.

---

### S1 — Modello, documento del GM e guard (≈ 3 giorni)

**Cosa vede l'utente**
- Niente ancora: è la base dati. Le stanze esistenti restano valide (tutti i campi facoltativi).

**Come**
- `packages/shared/src/board.ts`, sul token, campi facoltativi come quelli della F4:
  - `hp: { value, max, temp }.nullable().optional()`: interi, `value` tra −9999 e 9999 (in molti
    sistemi si va sotto zero), `max` ≥ 1, `temp` ≥ 0. Assente o null = il token non ha PF.
  - `hpVisibility: "all" | "band" | "gm"`: «Tutti» vedono i numeri; «Fascia» i giocatori vedono
    solo la barra a scatti; «Solo GM» i giocatori non vedono niente.
  - `hpBand: "healthy" | "wounded" | "bloodied" | "down"`: presente solo se
    `hpVisibility === "band"`.
  - `conditions: z.array(z.enum(CONDITION_IDS)).max(12).optional()`, senza doppioni (`refine`).
- Nuovo `packages/shared/src/conditions.ts`: catalogo `CONDITIONS` (id, colore, gruppo) con le
  condizioni comuni a molti sistemi: accecato, affascinato, assordato, spaventato, afferrato,
  incapacitato, invisibile, paralizzato, pietrificato, avvelenato, prono, trattenuto, stordito,
  privo di sensi, concentrato, segnato. L'etichetta sta nei cataloghi di traduzione; l'icona è
  un tracciato SVG in `apps/web/src/board/conditionIcons.ts`, riusato dal pannello HTML e da un
  `Konva.Path` sul token.
- `hpBandOf(hp)` in `packages/shared`: `healthy` se `value ≥ max`, `wounded` sopra metà,
  `bloodied` fino a metà (il «sanguinante» di 5e), `down` a 0 o meno. Test unitari ai bordi.
- PF segreti (`band` e `gm`): nel documento pubblico `hp` è assente e i valori veri stanno in
  `VITALS_MAP = "vitals"` del documento del GM (`id → { value, max, temp }`).
  - `BoardStore` generalizza la logica delle maschere (`update`, `remove`, `duplicate`,
    `setObscured`) in un «instradamento dei campi privati»: per ogni token, quali chiavi della
    patch vanno nella maschera (identità se `obscured`) e quali in `vitals` (PF se segreti),
    con la fascia ricalcolata e scritta sul token nella stessa azione di annulla. Senza questa
    generalizzazione `update` avrebbe due blocchi quasi uguali.
  - Il GM vede il token con i valori uniti, come oggi con `unmasked`.
  - Cambiando visibilità i PF si spostano tra token e `vitals` (prima si scrive la
    destinazione, poi si cancella l'origine, come in `setHidden`). Cancellando il token si
    cancella anche la voce `vitals`; duplicandolo la copia ha la sua voce, con PF pieni.
  - Un token nascosto sta già tutto nel documento del GM: i suoi PF possono restare sul token,
    ma per semplicità seguono la stessa regola (passando da nascosto a visibile non cambia
    nulla).
- `guard.ts`, in `isAllowedPlayerItemChange` accanto a `sameInitiativeMembership`:
  - `sameVitalsShape`: un giocatore non aggiunge né toglie `hp`, non cambia `max`,
    `hpVisibility` né `hpBand`. Può cambiare `value` e `temp` solo se `hpVisibility === "all"`.
  - Le condizioni le cambia chi può modificare il token (`canModify`): nessuna regola nuova
    oltre allo schema.
  - Test in `apps/server/test/guard.test.ts`: giocatore che cura un mostro con PF segreti
    (rifiutato), che si dà più PF massimi (rifiutato), che si toglie «avvelenato» (ammesso),
    che mette una condizione a un token bloccato (rifiutato).
- `duplicate({ asPlayer })`: una copia fatta da un giocatore non porta `hp` (come visione e
  luce), perché non potrebbe crearla.

### S2 — Barra e icone sul token (≈ 2 giorni)

**Cosa vede l'utente**
- Sotto il cerchio del token, sopra il nome, una **barra** sottile: verde, gialla, arancione o
  rossa secondo la fascia; i PF temporanei sono un tratto azzurro in coda. Con la visibilità
  «Fascia» i giocatori vedono la barra a quattro scatti, senza numeri; con «Solo GM» non vedono
  niente.
- Il GM, e tutti per i PF pubblici, vedono i numeri (`23/40`) passando sopra il token o con il
  token selezionato, non sempre: con molti token i numeri affollerebbero la mappa.
- Un token a 0 PF o meno ha il ritratto un po' desaturato e una piccola croce: si vede subito
  chi è a terra.
- Le **condizioni** sono icone tonde lungo l'arco inferiore del cerchio, fino a quattro; oltre,
  un «+N».

**Come**
- In `TokenContent` (`ItemNode.tsx`) un componente `VitalsBar` e uno `ConditionBadges`, come
  `ChainBadge` ed `ElevationPill`, con `listening={false}` e `name` per gli e2e
  (`hp-bar`, `condition-badge`). Il nome (`y={r + 4}`) scende dell'altezza della barra quando
  c'è.
- Una sola `Shape` Konva per la barra (con `sceneFunc`) e un `Konva.Path` per icona: niente
  gruppi annidati per token.
- Livello di dettaglio: sotto una dimensione a schermo del token (es. 24 px) si disegnano solo
  la barra e un punto colorato al posto delle icone. Misurare con `pnpm e2e:perf` e lo scenario
  con molti token.
- Token in incognito: barra e condizioni si vedono (sono informazioni di gioco, non di
  identità); se il GM vuole nascondere tutto, ha già «Nascondi».
- `TokenList.tsx` (l'elenco per gli screen reader) aggiunge fascia o PF e condizioni:
  «Goblin, malconcio, avvelenato, prono».

### S3 — Pannello, danni rapidi e turni (≈ 3 giorni)

**Cosa vede l'utente**
- Nel pannello di selezione del token, una sezione **Punti ferita**: attuali, massimi,
  temporanei e visibilità (solo GM). Un campo «Danno / cura» accetta `-7` o `+5` e lo applica
  premendo Invio; i PF temporanei si consumano per primi. Il GM aggiunge i PF con «Aggiungi
  punti ferita» (precompilato a 10/10): i token senza PF restano puliti.
- Una sezione **Condizioni**: griglia di icone da accendere e spegnere, con l'etichetta come
  `title` e `aria-pressed`.
- Con **più token selezionati** compaiono solo «Danno / cura» e le condizioni: una palla di
  fuoco su sei goblin è un solo gesto (e un solo annulla). I token senza PF o che chi agisce non
  può modificare vengono saltati, con un avviso del numero.
- Nel pannello **Turni**, accanto al nome, la fascia o i PF (secondo la visibilità) e le icone
  delle condizioni.

**Come**
- `apps/web/src/board/VitalsFields.tsx` e `ConditionsFields.tsx`, montati in `SelectionPanel`
  accanto ad `AuraFields` ed `ElevationField`, con gli stessi campi numerici stretti (vedi la
  correzione della T3).
- `applyDamage(hp, delta)` in `packages/shared`, pura e testata (temporanei prima, niente
  massimo superato curando).
- Il danno multiplo passa da un unico `store.update` con le patch di tutti i token: il
  «instradamento dei campi privati» della S1 manda ciascuna nel documento giusto.
- Testi nei cataloghi `it` ed `en` (`core.vitals.*`, catalogo `conditions` per `catalogLabel`).
- e2e `vitals.spec.ts` con due client: il GM imposta PF segreti a un mostro e lo ferisce; il
  giocatore vede solo la fascia e **i numeri non compaiono nei frame WebSocket** del giocatore
  (anche alla sincronizzazione iniziale); il giocatore si mette «prono» sul suo token e il GM lo
  vede; il guard annulla una cura forzata dal giocatore su un mostro. Archivio `.scryboard`:
  esportando e reimportando, `vitals` torna intatta (estendere `archive.spec.ts`).

### S4 — Rifiniture (≈ 2 giorni, facoltativa)

**Cosa vede l'utente**
- **Condizioni personalizzate**: un'etichetta breve con colore («Benedetto», «Marchio del
  cacciatore»), oltre al catalogo.
- **Durata in round**: una condizione può avere «per 3 round»; il contatore scende quando inizia
  il turno del token nell'ordine di iniziativa e la condizione sparisce a zero (con un avviso al
  GM). È un conto alla rovescia, non una regola: chi gioca senza iniziativa la ignora.
- **Scorciatoie**: con un token selezionato, `H` apre il campo «Danno / cura».

**Come**
- `conditions` diventa un array di `{ id, label?, color?, rounds? }`: si decide in S1 se partire
  già con oggetti per evitare una migrazione (vedi Decisioni). Le personalizzate hanno
  `id: "custom"` e `label` di massimo 24 caratteri.
- Il conteggio dei round sta nel client del GM, all'avanzare di `settings.turn` (l'unico che
  scrive il turno), nella stessa azione di «Avanti».

---

## Rischi e decisioni aperte

- **Forma di `conditions`**: un array di id è più semplice da validare e disegnare, ma la S4
  richiede oggetti. Consiglio di partire subito con `{ id, rounds? }` (con `label` e `color`
  riservati alle personalizzate): costa poco in S1 ed evita due forme da accettare per sempre.
- **Soglie delle fasce**: 100 % / sopra metà / fino a metà / ≤ 0 seguono 5e («sanguinante» a
  metà). Altri sistemi hanno soglie diverse, ma una fascia approssimativa è proprio ciò che
  serve ai giocatori; renderle configurabili non sembra valerne la pena.
- **Giocatori e token altrui**: senza il profilo nelle connessioni un giocatore può cambiare i
  PF attuali di qualunque token con PF pubblici, non solo del proprio. È lo stesso compromesso
  dell'iniziativa (T3); se diventa un problema serve il profilo firmato dal server, utile anche
  per il richiamo (T5).
- **Valore predefinito della visibilità**: proposta «Tutti» per i token con `owners` (i
  personaggi) e «Fascia» per gli altri, al momento in cui il GM aggiunge i PF.
- **Affollamento del token**: aura, anello di turno, selezione, catena, incognito, quota, nome e
  ora barra e condizioni. Verificare a zoom basso e con token piccoli (taglia 0,5) prima di
  chiudere la S2; in caso, le icone delle condizioni passano a un solo punto colorato sotto una
  certa dimensione.
