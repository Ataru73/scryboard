# Scryboard — Piano: controlli touch, tablet e dispositivi foldable

Obiettivo: offrire un'esperienza fluida e nativa su tablet (iPad, Android) e dispositivi pieghevoli
(Galaxy Z Fold, Pixel Fold), senza dipendere dalla tastiera fisica e senza compromettere l'esperienza
desktop mouse/tastiera.

---

## 1. Principi

- **"Two fingers for Canvas, One finger for Tool"**: a prescindere dallo strumento attivo (selezione,
  penna, righello, nebbia, timbri), il tocco a due dita controlla **sempre** pan e pinch-to-zoom
  simultanei. Un solo dito aziona lo strumento attivo.
- **Riconoscimento Penna vs Dito**: distinzione nativa tra `pointerType === "pen"` (Apple Pencil,
  S-Pen per disegno e precisione) e `"touch"` (dita per navigazione e manipolazione rapida con palm rejection).
- **Parità funzionale senza tastiera**: tutte le funzioni desktop legate a `Shift`, `Alt`, `Space`,
  `Delete`, `Ctrl+Z` dispongono di corrispettivi touch immediati (gesti multi-touch, touch modifiers
  o quick action).
- **Zero regressioni desktop**: mouse e tastiera conservano identico comportamento.
- **Foldable-aware**: cover screen stretto utilizzabile senza collisioni di barre, inner screen ampio
  ergonomico per i due pollici, supporto a "Flex Mode" (tabletop posture) con mappa in alto e console comandi in basso.

---

## 2. Ordine delle fasi

```
F1 Multi-Touch Engine  →  F2 Touch Targets & Transformer  →  F3 Touch Modifiers & Context Actions
→  F4 Layout Foldable & Bottom Sheet  →  F5 Flex Mode Console  →  F6 Safe Areas & Test E2E
```

---

### F1 — Multi-Touch Gestures Engine (Pinch-to-zoom & 2-finger Pan)

- **Gesture Tracker**: tracciamento dei pointer attivi (`activePointers: Map<number, Point>`).
- **2 Dita**:
  - All'arrivo del secondo tocco, cancellazione immediata di qualunque interazione a 1 dito in corso
    (tratto penna, selezione marquee, trascinamento token).
  - Panning vettoriale tramite spostamento del baricentro (midpoint) tra le due dita.
  - Zoom proporzionale alla variazione di distanza tra le due dita, ancorato al midpoint tramite `zoomAt()`.
  - Grace period di 150ms al rilascio di una delle dita per evitare click o tratti fantasma.
- **Multi-tap Gestures**:
  - Tap a 2 dita: Annulla (`Undo`).
  - Tap a 3 dita: Ripeti (`Redo`).
- **Puntatore Penna / Stilo**:
  - `pointerType === "pen"` prioritario per disegno/precisione.

---

### F2 — Touch Targets & Ergonomia Konva

- Regole CSS per `@media (pointer: coarse)`:
  - Dimensione minima target interattivi a 44×44 px (`icon-button`, select, bottoni colore).
- Konva `Transformer`:
  - `anchorSize: 22` px (rispetto ai 10 px default) su dispositivi touch.
  - Ancoraggio di rotazione con padding maggiorato per separarlo visivamente dall'ancora angolare.
- Maniglie percorsi (`PathHandles`) e nodi muri (`WallHandles`):
  - Area di hit (`hitStrokeWidth`) aumentata a 24 px per facilitare la manipolazione touch.

---

### F3 — Touch Modifiers & Azioni Rapide per Token

- Controlli virtuali per sostituire i tasti fisici:
  - Toggle **Grid Snap** (equiv. `Alt` per posizionamento e righello liberi).
  - Toggle **Multi-Select** (equiv. `Shift` per selezione multipla con tap singoli).
  - Pulsanti Undo / Redo sempre accessibili.
- Pressione prolungata su un token (>500ms): apertura rapida pannello proprietà / azioni token.

---

### F4 — Adattamento Responsive & Foldable Cover Screen

- Layout per schermi stretti (`max-width: 600px` / foldable chiuso):
  - La colonna degli strumenti collassa in una Bottom Bar orizzontale a comparsa.
  - `SelectionPanel` visualizzato come Bottom Sheet a scomparsa.
  - Sidebar giocatori/scene come Drawer a tutto schermo con backdrop.
- Gestione resize dinamico tra stato chiuso e aperto senza perdita del punto focale della mappa.

---

### F5 — Flex Mode / Tabletop Posture Console

- Media query e feature CSS:
  - `@media (horizontal-viewport-segments: 2)`, `screen-fold-posture: table-top`.
  - Schermo superiore: Battlemap Konva pulita.
  - Schermo inferiore: Console tattica (Dadi, Iniziativa, Scheda Token, Chat).
- Calcolo dei margini anti-piega tramite `env(viewport-segment-width/height)`.

---

### F6 — Safe Areas, Viewport Settings & Test E2E

- Aggiornamento di `apps/web/index.html` con `viewport-fit=cover` e `interactive-widget=resizes-content`.
- CSS con `env(safe-area-inset-*)`.
- Test E2E Playwright con profili tablet (`iPad Pro 11`) e foldable (`Galaxy Z Fold`).
