import type { HocuspocusProvider } from "@hocuspocus/provider";
import { describeRoll, formatDice, parseDice, type Roll } from "@scryboard/shared";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { describeApiError } from "../lib/api";
import { MAX_DICE_PRESETS, storage } from "../lib/storage";
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
  const { t } = useTranslation();
  const shared = useRolls(provider);
  const hiddenRolls = useLocalRolls((s) => s.hidden);
  const isGm = "gmToken" in auth;
  const [formula, setFormula] = useState("");
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [presets, setPresets] = useState(() => storage.getDicePresets());
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
      // Con la barra laterale lunga il registro può stare sotto il bordo: lo si porta in vista.
      requestAnimationFrame(() => listRef.current?.scrollIntoView({ block: "nearest" }));
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setBusy(false);
    }
  }

  /** La formula scritta si può salvare solo se è valida e non c'è già (stessa forma canonica). */
  const canonical = (text: string) => {
    try {
      return formatDice(parseDice(text));
    } catch {
      return null;
    }
  };
  const current = canonical(formula);
  const canSave =
    current !== null && !presets.includes(current) && presets.length < MAX_DICE_PRESETS;

  function updatePresets(next: string[]) {
    setPresets(next);
    storage.setDicePresets(next);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void roll(formula);
  }

  return (
    <div className="roll-panel">
      <form className="roll-form" onSubmit={submit}>
        <label htmlFor={formulaId} className="visually-hidden">
          {t("social.dice.formulaLabel")}
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
          {t("social.dice.roll")}
        </button>
      </form>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
      <div className="roll-quick">
        {QUICK_DICE.map((sides) => (
          <button key={sides} type="button" disabled={busy} onClick={() => void roll(`1d${sides}`)}>
            d{sides}
          </button>
        ))}
      </div>
      <section className="roll-presets" aria-label={t("social.dice.presetsLabel")}>
        {presets.map((preset) => (
          <span key={preset} className="roll-preset">
            <button
              type="button"
              disabled={busy}
              title={t("social.dice.presetRoll", { formula: preset })}
              onClick={() => void roll(preset)}
            >
              {preset}
            </button>
            <button
              type="button"
              className="roll-preset-remove"
              aria-label={t("social.dice.presetRemove", { formula: preset })}
              onClick={() => updatePresets(presets.filter((p) => p !== preset))}
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          className="roll-preset-save"
          disabled={!canSave}
          title={t("social.dice.presetSaveHint")}
          onClick={() => current && updatePresets([...presets, current])}
        >
          {t("social.dice.presetSave")}
        </button>
      </section>
      <p className="muted small roll-help">{t("social.dice.help")}</p>
      {isGm && (
        <label className="checkbox small">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          {t("social.dice.hiddenLabel")}
        </label>
      )}
      <ol className="roll-log" ref={listRef} aria-label={t("social.dice.logLabel")}>
        {log.length === 0 && <li className="muted small">{t("social.dice.empty")}</li>}
        {log.map(({ roll, secret }) => (
          <RollEntry key={`${secret ? "h" : "s"}-${roll.id}`} roll={roll} secret={secret} />
        ))}
      </ol>
    </div>
  );
}

function RollEntry({ roll, secret }: { roll: Roll; secret: boolean }) {
  const { t } = useTranslation();

  return (
    <li className={secret ? "roll-entry secret" : "roll-entry"}>
      <span className="roll-head">
        <strong>{roll.name}</strong> <span className="muted">{roll.formula}</span>
        {secret && <span className="muted small"> {t("social.dice.hiddenSuffix")}</span>}
      </span>
      <span className="roll-detail muted small">{describeRoll(roll)}</span>
      <output className="roll-total" aria-label={t("social.dice.total", { name: roll.name })}>
        {roll.total}
        {roll.terms.some((term) => term.kind === "dice" && term.success) && (
          <span className="roll-unit muted small">
            {t("social.dice.successes", { count: Math.abs(roll.total) })}
          </span>
        )}
      </output>
    </li>
  );
}
