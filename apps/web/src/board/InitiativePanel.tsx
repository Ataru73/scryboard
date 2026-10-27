import { initiativeOrder, type Role, type TokenItem, type TurnSettings } from "@scryboard/shared";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { BoardStore } from "./store";
import { useBoardUi } from "./tools";
import { VitalsSummary } from "./VitalsSummary";

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
  const { t } = useTranslation();
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
    <section className="panel initiative-panel" aria-label={t("effects.initiative.title")}>
      <header>
        <h2>{t("effects.initiative.title")}</h2>
        <span className="muted small">{t("effects.initiative.round", { round: turn.round })}</span>
        <button
          type="button"
          className="icon-button"
          aria-label={t("effects.initiative.close")}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      {order.length === 0 ? (
        <p className="muted small">
          {gm ? t("effects.initiative.emptyGm") : t("effects.initiative.emptyPlayer")}
        </p>
      ) : (
        <ol className="initiative-list">
          {order.map((token) => (
            <li key={token.id} aria-current={token.id === turn.activeId ? "step" : undefined}>
              <span className="initiative-name">
                {token.name ||
                  (token.obscured
                    ? t("effects.initiative.unknown")
                    : t("effects.initiative.unnamed"))}
                {gm && store.isHidden(token.id) && (
                  <span className="muted small"> ({t("effects.initiative.hidden")})</span>
                )}
                {gm && token.obscured && (
                  <span className="muted small"> ({t("effects.initiative.obscured")})</span>
                )}
              </span>
              <VitalsSummary token={token} />
              <input
                type="number"
                aria-label={t("effects.initiative.initiativeFor", {
                  name: token.name || t("effects.initiative.token"),
                })}
                defaultValue={token.initiative as number}
                key={`${token.id}-${token.initiative}`}
                disabled={token.locked && !gm}
                onBlur={(e) => {
                  const value = parseValue(e.target.value);
                  if (value === null) e.target.value = String(token.initiative);
                  else if (value !== token.initiative) store.setInitiative([token.id], value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
              {gm && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("effects.initiative.removeFromOrder", {
                    name: token.name || t("effects.initiative.token"),
                  })}
                  onClick={() => store.setInitiative([token.id], null)}
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
          {t("effects.initiative.hiddenActiveTurn")}
        </p>
      )}
      {gm && (
        <div className="initiative-actions">
          <button
            type="button"
            disabled={addable.length === 0}
            onClick={() => store.setInitiative(addable, 0)}
          >
            {t("effects.initiative.addSelection")}
          </button>
          <button
            type="button"
            title={t("effects.initiative.previousTurnTitle")}
            disabled={order.length === 0}
            onClick={() => store.advanceTurn(-1)}
          >
            {t("effects.initiative.previousTurn")}
          </button>
          <button
            type="button"
            className="primary"
            title={t("effects.initiative.nextTurnTitle")}
            disabled={order.length === 0}
            onClick={() => store.advanceTurn(1)}
          >
            {t("effects.initiative.nextTurn")}
          </button>
          <button
            type="button"
            disabled={order.length === 0 && !turn.activeId}
            title={t("effects.initiative.endCombatTitle")}
            onClick={() => {
              store.setInitiative(
                store.getInitiativeOrder().map((t) => t.id),
                null,
              );
              store.resetTurn();
            }}
          >
            {t("effects.initiative.endCombat")}
          </button>
        </div>
      )}
    </section>
  );
}
