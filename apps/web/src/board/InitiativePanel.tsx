import { initiativeOrder, type Role, type TokenItem, type TurnSettings } from "@scryboard/shared";
import { useSyncExternalStore } from "react";
import type { BoardStore } from "./store";
import { useBoardUi } from "./tools";

interface Props {
  store: BoardStore;
  role: Role;
  /** Token che chi guarda può vedere: gli altri non compaiono nell'elenco. */
  tokens: TokenItem[];
  onClose: () => void;
}

function parseValue(text: string): number | null {
  const n = Number(text.replace(",", "."));
  return text.trim() !== "" && Number.isFinite(n) && n >= -1000 && n <= 1000 ? n : null;
}

/** Ordine dei turni: il GM lo gestisce, i giocatori lo vedono e ritoccano i valori. */
export function InitiativePanel({ store, role, tokens, onClose }: Props) {
  useSyncExternalStore(store.subscribe, store.getSnapshot);
  const turn: TurnSettings = useSyncExternalStore(store.subscribe, store.getTurn);
  const selectedIds = useBoardUi((s) => s.selectedIds);
  const order = initiativeOrder(tokens);
  const gm = role === "gm";
  const activeShown = order.some((t) => t.id === turn.activeId);
  const addable = selectedIds.filter((id) => {
    const item = store.get(id);
    return item?.kind === "token" && typeof item.initiative !== "number";
  });

  return (
    <section className="panel initiative-panel" aria-label="Turni">
      <header>
        <h2>Turni</h2>
        <span className="muted small">Round {turn.round}</span>
        <button type="button" className="icon-button" aria-label="Chiudi" onClick={onClose}>
          ×
        </button>
      </header>
      {order.length === 0 ? (
        <p className="muted small">
          {gm
            ? "Seleziona dei token e premi «Aggiungi selezione»."
            : "Il GM non ha ancora fissato l'ordine dei turni."}
        </p>
      ) : (
        <ol className="initiative-list">
          {order.map((t) => (
            <li key={t.id} aria-current={t.id === turn.activeId ? "step" : undefined}>
              <span className="initiative-name">
                {t.name || "Senza nome"}
                {gm && store.isHidden(t.id) && <span className="muted small"> (nascosto)</span>}
              </span>
              <input
                type="number"
                aria-label={`Iniziativa di ${t.name || "token"}`}
                defaultValue={t.initiative as number}
                key={`${t.id}-${t.initiative}`}
                disabled={t.locked && !gm}
                onBlur={(e) => {
                  const value = parseValue(e.target.value);
                  if (value === null) e.target.value = String(t.initiative);
                  else if (value !== t.initiative) store.setInitiative([t.id], value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
              {gm && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Togli ${t.name || "token"} dall'ordine`}
                  onClick={() => store.setInitiative([t.id], null)}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {turn.activeId && !activeShown && order.length > 0 && (
        <p className="muted small" role="status">
          Turno di qualcuno che non vedi.
        </p>
      )}
      {gm && (
        <div className="initiative-actions">
          <button
            type="button"
            disabled={addable.length === 0}
            onClick={() => store.setInitiative(addable, 0)}
          >
            Aggiungi selezione
          </button>
          <button
            type="button"
            title="Turno precedente"
            disabled={order.length === 0}
            onClick={() => store.advanceTurn(-1)}
          >
            Indietro
          </button>
          <button
            type="button"
            className="primary"
            title="Turno successivo (N)"
            disabled={order.length === 0}
            onClick={() => store.advanceTurn(1)}
          >
            Avanti
          </button>
          <button
            type="button"
            disabled={order.length === 0 && !turn.activeId}
            title="Toglie tutti dall'ordine e riparte dal round 1"
            onClick={() => {
              store.setInitiative(
                store.getInitiativeOrder().map((t) => t.id),
                null,
              );
              store.resetTurn();
            }}
          >
            Fine combattimento
          </button>
        </div>
      )}
    </section>
  );
}
