import { PORTRAIT_CATEGORIES, PORTRAITS } from "@scryboard/shared";
import { useEffect, useId, useMemo, useState } from "react";
import { storage } from "../lib/storage";
import { GeneratePanel } from "./GeneratePanel";
import { loadPortraitPaths, usePortraitPath } from "./portraitPaths";
import { UploadedAssets } from "./UploadedAssets";

type Portrait = (typeof PORTRAITS)[number];

/** Minuscole e senza accenti, così "orsò" e "Orso" si trovano a vicenda. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Sagoma della libreria su un cerchio del colore del token (anteprima, non il token reale). */
export function PortraitGlyph({ id, color }: { id: string; color: string }) {
  const data = usePortraitPath(id);
  return (
    <svg className="portrait-glyph" viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <circle cx="256" cy="256" r="256" fill={color} />
      {data && <path d={data} fill="#ffffff" transform="translate(64 64) scale(0.75)" />}
    </svg>
  );
}

interface Props {
  /** Colore del token, usato per le anteprime. */
  color: string;
  roomId: string;
  /** Nome del token, descrizione iniziale della generazione. */
  tokenName: string;
  onPick: (portrait: Portrait) => void;
  /** Immagine generata (asset della stanza) scelta dall'utente. */
  onPickAsset: (assetId: string) => void;
  onClose: () => void;
}

/** Finestra con la libreria di immagini: ricerca, categorie e immagini usate di recente. */
export function PortraitPicker({ color, roomId, tokenName, onPick, onPickAsset, onClose }: Props) {
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  // La scheda Genera esiste solo con una chiave di Gemini.
  const [apiKey] = useState(() => storage.getGeminiKey());
  const [tab, setTab] = useState<"library" | "uploaded" | "generate">("library");
  const [recent] = useState(() => storage.getRecentPortraits());
  // Le anteprime si disegnano appena il chunk è scaricato.
  useEffect(() => {
    loadPortraitPaths().catch(() => {});
  }, []);

  const shown = useMemo(() => {
    const q = normalize(query.trim());
    return PORTRAITS.filter(
      (p) =>
        (!category || p.category === category) &&
        (!q || normalize(`${p.label} ${p.aliases.join(" ")}`).includes(q)),
    );
  }, [query, category]);
  const recentEntries = recent.flatMap((id) => PORTRAITS.find((p) => p.id === id) ?? []);

  const button = (p: Portrait) => (
    <button
      key={p.id}
      type="button"
      className="portrait-button"
      title={p.label}
      aria-label={p.label}
      onClick={() => onPick(p)}
    >
      <PortraitGlyph id={p.id} color={color} />
      <span>{p.label}</span>
    </button>
  );

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc chiude nativamente <dialog>.
    <dialog
      ref={(el) => {
        if (el && !el.open) el.showModal();
      }}
      className="card stack modal portrait-modal"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <h2 id={titleId}>Libreria di immagini</h2>
      <fieldset className="portrait-categories" aria-label="Origine">
        <button type="button" aria-pressed={tab === "library"} onClick={() => setTab("library")}>
          Libreria
        </button>
        <button type="button" aria-pressed={tab === "uploaded"} onClick={() => setTab("uploaded")}>
          Caricati
        </button>
        {apiKey && (
          <button
            type="button"
            aria-pressed={tab === "generate"}
            onClick={() => setTab("generate")}
          >
            Genera
          </button>
        )}
      </fieldset>
      {tab === "uploaded" ? (
        <UploadedAssets roomId={roomId} onPickAsset={onPickAsset} />
      ) : tab === "generate" && apiKey ? (
        <GeneratePanel
          roomId={roomId}
          apiKey={apiKey}
          tokenName={tokenName}
          onPickAsset={onPickAsset}
        />
      ) : (
        <>
          <input
            type="search"
            aria-label="Cerca nella libreria"
            placeholder="Cerca (es. goblin, dragon)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <fieldset className="portrait-categories" aria-label="Categorie">
            <button
              type="button"
              aria-pressed={category === null}
              onClick={() => setCategory(null)}
            >
              Tutte
            </button>
            {PORTRAIT_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
              >
                {c.label}
              </button>
            ))}
          </fieldset>
          {recentEntries.length > 0 && !query && !category && (
            <section aria-label="Recenti">
              <h3 className="muted small">Recenti</h3>
              <div className="portrait-grid">{recentEntries.map(button)}</div>
            </section>
          )}
          <div className="portrait-grid">{shown.map(button)}</div>
          {shown.length === 0 && <p className="muted small">Nessuna immagine trovata.</p>}
        </>
      )}
      <p className="muted small">
        Sagome di{" "}
        <a href="https://game-icons.net" target="_blank" rel="noreferrer">
          game-icons.net
        </a>{" "}
        (CC BY 3.0).
      </p>
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          Chiudi
        </button>
      </div>
    </dialog>
  );
}
