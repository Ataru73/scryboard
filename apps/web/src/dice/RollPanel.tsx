import type { HocuspocusProvider } from "@hocuspocus/provider";
import { describeRoll, type Roll } from "@scryboard/shared";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { describeApiError } from "../lib/api";
import { type Auth, rollFormula, useLocalRolls, useRolls } from "./rolls";

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100] as const;

interface Props {
  roomId: string;
  provider: HocuspocusProvider | null;
  myName: string;
  auth: Auth;
}

/** Scheda «Tavolo»: dadi e registro dei tiri, visibili a tutti. */
export function RollPanel({ roomId, provider, myName, auth }: Props) {
  const shared = useRolls(provider);
  const hiddenRolls = useLocalRolls((s) => s.hidden);
  const isGm = "gmToken" in auth;
  const [formula, setFormula] = useState("");
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formulaId = useId();
  const listRef = useRef<HTMLOListElement>(null);

  const log = useMemo(
    () =>
      [
        ...shared.map((roll) => ({ roll, secret: false })),
        ...hiddenRolls.map((roll) => ({ roll, secret: true })),
      ]
        .sort((a, b) => (a.roll.at < b.roll.at ? -1 : a.roll.at > b.roll.at ? 1 : 0))
        .slice(-60),
    [shared, hiddenRolls],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: si scorre in fondo a ogni nuovo tiro.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [log.length]);

  async function roll(text: string) {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      await rollFormula(roomId, body, myName, auth, isGm && hidden);
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void roll(formula);
  }

  return (
    <div className="roll-panel">
      <form className="roll-form" onSubmit={submit}>
        <label htmlFor={formulaId} className="visually-hidden">
          Formula dei dadi
        </label>
        <input
          id={formulaId}
          value={formula}
          maxLength={100}
          placeholder="2d20kh1+5"
          autoComplete="off"
          onChange={(e) => setFormula(e.target.value)}
        />
        <button type="submit" className="primary" disabled={busy || !formula.trim()}>
          Tira
        </button>
      </form>
      <div className="roll-quick">
        {QUICK_DICE.map((sides) => (
          <button key={sides} type="button" disabled={busy} onClick={() => void roll(`1d${sides}`)}>
            d{sides}
          </button>
        ))}
      </div>
      {isGm && (
        <label className="checkbox small">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          Tira di nascosto (solo tu lo vedi)
        </label>
      )}
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
      <ol className="roll-log" ref={listRef} aria-label="Registro dei tiri">
        {log.length === 0 && <li className="muted small">Ancora nessun tiro.</li>}
        {log.map(({ roll, secret }) => (
          <RollEntry key={`${secret ? "h" : "s"}-${roll.id}`} roll={roll} secret={secret} />
        ))}
      </ol>
    </div>
  );
}

function RollEntry({ roll, secret }: { roll: Roll; secret: boolean }) {
  return (
    <li className={secret ? "roll-entry secret" : "roll-entry"}>
      <span className="roll-head">
        <strong>{roll.name}</strong> <span className="muted">{roll.formula}</span>
        {secret && <span className="muted small"> (nascosto)</span>}
      </span>
      <span className="roll-detail muted small">{describeRoll(roll)}</span>
      <output className="roll-total" aria-label={`Totale di ${roll.name}`}>
        {roll.total}
      </output>
    </li>
  );
}
