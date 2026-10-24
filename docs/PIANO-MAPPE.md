# Scryboard — Piano: pittura delle mappe, muri e luci

Obiettivo: permettere al GM di **dipingere la mappa direttamente sulla lavagna, anche durante la
sessione**, invece di caricare solo immagini già pronte. Le funzionalità prendono spunto da
Zephyrex Cartography (modulo open source per Foundry VTT) e da MapForge/Inkarnate:
1. **Biomi dipingibili** (erba, foresta, roccia, neve, sabbia, acqua…), a mano libera o come
   regioni dai bordi morbidi.
2. **Strade e fiumi** come percorsi a larghezza variabile; i fiumi si assottigliano alle
   estremità.
3. **Muri, porte e luci** che influenzano visione, movimento e illuminazione senza
   configurazioni extra.

> Zephyrex Cartography è AGPL: lo si usa come ispirazione, **senza copiarne il codice**
> (incorporarlo obbligherebbe a rilasciare tutto Scryboard sotto AGPL).

## Principi

- **Si dipinge dal vivo**: ogni pennellata arriva ai giocatori come le altre modifiche (Yjs),
  con annulla/ripeti per azione.
- **Il GM può preparare di nascosto**: pittura, muri e luci rispettano la modalità "Crea
  nascosti" e la nebbia già esistenti.
- **Leggero sul server**: si sincronizzano i gesti (tratti, punti di controllo), non i pixel; il
  rendering avviene nei browser.
- **Nessuna dipendenza da asset a pagamento**: texture generate proceduralmente nel browser, con
  la possibilità di aggiungere texture CC0 (es. ambientCG) in un secondo momento.

## Livelli della lavagna

L'ordine attuale (mappa → griglia → token → nebbia → disegni) diventa:

```
terreno (biomi) → percorsi (strade, fiumi) → mappa (immagini) → griglia → muri/porte (solo GM)
→ token → illuminazione e visione → nebbia statica → disegni
```

Terreno e percorsi stanno sotto le immagini, così una mappa caricata e un terreno dipinto possono
convivere (per esempio un edificio importato su un prato dipinto).

## Fasi

### F1 — Biomi dipingibili (≈ 2 settimane) ✅

**Stato**: completata. Note rispetto al piano:
- Il bordo sfumato si ottiene disegnando ogni pennellata come maschera sfocata su un canvas di
  lavoro e riempiendola con la texture (`source-in`): la texture resta nitida, solo il bordo
  sfuma.
- I tasselli si ridisegnano a piccoli blocchi tra un frame e l'altro (8 ms per frame), mostrando
  nel frattempo i tasselli di un altro livello di zoom; da lontano (zoom sotto il 35%) le
  pennellate si disegnano in modo semplificato, perché bordo irregolare e sfumatura non si
  vedono.
- Misure (`pnpm e2e:perf`, Chromium headless, 2.000 pennellate su 60×40 caselle): mappa
  completa in meno di 100 ms, pan a ~60 fps, nessun blocco della pagina oltre ~90 ms.
- Il terreno sta sempre nel documento pubblico: "Crea nascosti" non vale per il terreno. Per
  preparare una zona in segreto il GM la copre prima con la nebbia.

**Cosa vede l'utente**
- Nuovo strumento **Terreno** (solo GM, tasto `B`) con una tavolozza di biomi: erba, prato
  secco, foresta, roccia, ghiaia, sabbia, neve, ghiaccio, fango, palude, acqua bassa, acqua
  profonda, lava (13, come Zephyrex).
- Due modalità: **pennello** a mano libera (dimensione regolabile) e **regione** (poligono a
  clic con bordi smussati automaticamente).
- **Gomma del terreno** e bordi sfumati in modo naturale tra un bioma e l'altro.

**Come**
- Modello: Y.Map `terrain` nel documento pubblico, con operazioni ordinate come la nebbia:
  `{ id, seq, biome, mode: "paint" | "erase", shape: "brush" | "region", points, width }`.
  I punti si semplificano (Ramer–Douglas–Peucker) prima di salvarli, per tenere piccoli i
  documenti.
- Rendering: per ogni bioma una **maschera** (canvas fuori schermo) dove si disegnano i tratti;
  la texture del bioma si applica con `source-in`. I bordi irregolari si ottengono con un leggero
  rumore sul contorno e una sfumatura della maschera.
- Prestazioni: rendering **a tasselli** (es. 1024×1024 px del mondo) con cache; si ridisegnano
  solo i tasselli toccati da un'operazione nuova. Obiettivo: pan fluido (≥ 50 fps) con qualche
  migliaio di pennellate.
- Texture procedurali (rumore value/Perlin con tavolozze per bioma) generate una volta all'avvio
  e ripetibili senza cuciture.
- Server: il guard aggiunge `terrain` alle mappe riservate al GM.

**Criteri di accettazione**
- Il giocatore vede la pennellata del GM entro 200 ms, già con la texture.
- Una mappa di 60×40 caselle dipinta con 2.000 pennellate resta fluida.
- Annulla/ripeti per pennellata; gomma e regioni funzionano su tutti i biomi.

### F2 — Strade e fiumi (≈ 1–1,5 settimane) ✅

**Stato**: completata. Note rispetto al piano:
- I percorsi sono oggetti della lavagna sul nuovo livello `paths` (sotto le mappe), riservato al
  GM come il livello mappa: il server annulla le modifiche dei giocatori.
- Ogni stile è fatto di fasce sovrapposte (rive, ciglio, acqua bassa, acqua profonda) con
  texture procedurali; le strade hanno estremità arrotondate, ruscelli e fiumi si assottigliano.
- La larghezza dei punti nuovi si regola con `[` e `]` durante il disegno; dopo, dal pannello di
  selezione (del punto selezionato o di tutto il percorso). La rotella resta allo zoom.
- La texture segue il mondo, non la direzione della strada: le file del selciato non ruotano con
  le curve.

**Cosa vede l'utente**
- Strumento **Percorso** (solo GM, tasto `J`) con stili: sentiero, strada sterrata, strada
  lastricata, ruscello, fiume.
- Si disegna cliccando punti di controllo (o trascinando); la curva si smussa da sola.
- **Larghezza variabile** per punto (rotella o maniglia sul punto); i fiumi si
  **assottigliano alle estremità** in automatico.
- Dopo averlo creato, il percorso si modifica trascinando i punti di controllo.

**Come**
- Nuovo tipo di oggetto `path` nel modello condiviso: `{ style, points: [x, y, width][] }`,
  livello `paths`. Essendo un oggetto come gli altri, eredita selezione, blocco,
  nascondi/rivela, annulla e permessi.
- Geometria: spline Catmull–Rom → campionamento → poligono di offset con larghezze interpolate
  (contorno sinistro + destro) → riempimento con texture dello stile; bordo più scuro per le
  rive e i cigli.
- Test unitari sulla geometria (offset, assottigliamento, casi degeneri come curve strette).

### F3 — Muri e porte (≈ 1,5 settimane)

**Cosa vede l'utente**
- Strumento **Muri** (solo GM, tasto `W`): polilinee che si agganciano agli angoli della
  griglia; tipi muro, porta, finestra (blocca il movimento ma non la vista), muro invisibile.
- Le porte hanno stato **aperta / chiusa / chiusa a chiave**; il GM le apre con un clic, i
  giocatori solo se non sono chiuse a chiave (da decidere).
- **Generazione automatica**: "crea muri dai bordi del bioma" (es. il contorno della roccia di
  una caverna), come fa Zephyrex.
- I giocatori non vedono i muri disegnati, solo i loro effetti (le porte appaiono come icona).

**Come**
- Y.Map `walls` nel documento pubblico: `{ id, kind, points, door?: "open" | "closed" |
  "locked" }`. Il guard permette ai giocatori solo di cambiare lo stato delle porte non chiuse a
  chiave.
- **Movimento**: trascinando un token, un giocatore non attraversa i muri (intersezione tra il
  segmento percorso e i muri; il token si ferma prima). Il GM può ignorare il blocco con Alt.
- Generazione dai bordi: contorno della maschera del bioma (marching squares) → semplificazione
  → segmenti di muro.

### F4 — Luci e visione dinamica (≈ 2–2,5 settimane)

**Cosa vede l'utente**
- Strumento **Luce** (solo GM, tasto `I`): sorgenti con raggio di luce piena e fioca, colore,
  intensità; torce e lanterne anche attaccate ai token.
- **Visione per token**: raggio di vista e scurovisione; ogni giocatore vede ciò che vedono i
  propri token, il resto è buio.
- **Memoria delle aree esplorate**: ciò che si è già visto resta in penombra.
- **Luce ambientale** regolabile dal GM (giorno, crepuscolo, notte).
- Il GM vede tutto, con un'anteprima "come la vede il giocatore X".

**Come**
- Poligono di visibilità per ogni sorgente/token calcolato contro i muri (algoritmo a ventaglio
  di raggi verso i vertici dei muri), in un Web Worker per non bloccare il disegno.
- Illuminazione su un Layer dedicato: buio di base, sorgenti con gradiente radiale e
  `destination-out`, come la nebbia statica.
- Proprietà dei token: nuovo campo `owners` (chi lo controlla) e `vision` (raggio,
  scurovisione) nel modello del token.
- Aree esplorate salvate per giocatore (maschera a bassa risoluzione nel documento del GM o
  nell'archivio del server).
- **Limite noto, da accettare o affrontare**: come per la nebbia statica, la visione calcolata
  nel browser nasconde solo a schermo; un giocatore esperto potrebbe vedere la mappa intera. Una
  variante più sicura (il server invia a ciascun giocatore solo ciò che vede) è molto più
  costosa e va valutata dopo.

### F5 — Rifiniture per la pittura in sessione (≈ 1 settimana)

- Tavolozza rapida con scorciatoie numeriche (1–9) per biomi e stili usati di recente.
- **Timbri**: alberi, rocce, cespugli, mobili da piazzare con un clic, con rotazione e scala
  casuali (immagini SVG generate o CC0).
- Copia/incolla di porzioni di terreno; riempimento di un'area chiusa con un bioma.
- "Pittura nascosta": il GM dipinge sotto la nebbia statica e rivela al momento giusto.

## Ordine consigliato e stime

| Fase | Contenuto                 | Stima             | Dipende da                          |
| ---- | ------------------------- | ----------------- | ----------------------------------- |
| F1   | Biomi dipingibili         | ≈ 2 settimane     | —                                   |
| F2   | Strade e fiumi            | ≈ 1–1,5 settimane | F1 (texture, livelli)               |
| F3   | Muri e porte              | ≈ 1,5 settimane   | — (la generazione dai bordi usa F1) |
| F4   | Luci e visione dinamica   | ≈ 2–2,5 settimane | F3                                  |
| F5   | Rifiniture per la pittura | ≈ 1 settimana     | F1, F2                              |

Totale indicativo: **7,5–8,5 settimane** per una persona. F1 e F2 danno subito valore anche a
chi gioca "teatro della mente con mappa"; F3 e F4 trasformano Scryboard in un VTT più completo e
sono la parte più costosa.

## Decisioni da prendere

1. **Priorità**: prima la pittura (F1–F2) o prima muri e visione (F3–F4)?
2. **Porte**: i giocatori possono aprire le porte non chiuse a chiave?
3. **Visione dinamica**: va bene la versione calcolata nel browser (semplice, ma aggirabile da
   chi usa gli strumenti di sviluppo) per il gioco tra amici?
4. **Texture**: procedurali (zero dipendenze, stile più semplice) o texture CC0 incluse
   nell'app (più belle, qualche MB in più)?
