import type { HocuspocusProvider } from "@hocuspocus/provider";
import {
  type DiceStats,
  describeRoll,
  diceStats,
  formatDice,
  parseDice,
  type Roll,
  splitRepeat,
  splitRollLabel,
} from "@scryboard/shared";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, describeApiError } from "../lib/api";
import { MAX_DICE_PRESETS, storage } from "../lib/storage";
import { playDiceRollSound, unlockAudioContext } from "./diceSound";
import { type Auth, describeRollError, rollRepeated, useLocalRolls, useRolls } from "./rolls";

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100] as const;

interface Props {
  roomId: string;
  provider: HocuspocusProvider | null;
  myName: string;
  auth: Auth;
}

/** Scheda «Dadi»: dadi e registro dei tiri, visibili a tutti. */
export function RollPanel({ roomId, provider, myName, auth }: Props) {
  const { t } = useTranslation();
  const shared = useRolls(provider);
  const hiddenRolls = useLocalRolls((s) => s.hidden);
  const isGm = "gmToken" in auth;
  const [formula, setFormula] = useState("");
  const [hidden, setHidden] = useState(false);
  const [soundMuted, setSoundMuted] = useState(() => storage.getDiceSoundMuted());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [presets, setPresets] = useState(() => storage.getDicePresets());
  const [confirmClear, setConfirmClear] = useState(false);
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
    unlockAudioContext();
    setBusy(true);
    setError(null);
    try {
      await rollRepeated(roomId, body, myName, auth, isGm && hidden);
      // Con la barra laterale lunga il registro può stare sotto il bordo: lo si porta in vista.
      requestAnimationFrame(() => listRef.current?.scrollIntoView({ block: "nearest" }));
    } catch (e) {
      setError(describeRollError(e));
    } finally {
      setBusy(false);
    }
  }

  /** Forma canonica e statistiche della formula scritta, o `null` se non è valida. */
  const parsed = useMemo(() => {
    try {
      // Ripetizioni ed etichetta dopo «#» non entrano nel calcolo ma restano nella formula salvata.
      const { times, formula: single } = splitRepeat(formula);
      const { formula: dice, label } = splitRollLabel(single);
      const specs = parseDice(dice);
      return {
        canonical:
          (times > 1 ? `${times}x ` : "") + formatDice(specs) + (label ? ` # ${label}` : ""),
        stats: diceStats(specs),
      };
    } catch {
      return null;
    }
  }, [formula]);
  // La formula scritta si può salvare solo se è valida e non c'è già (stessa forma canonica).
  const current = parsed?.canonical ?? null;
  const canSave =
    current !== null && !presets.includes(current) && presets.length < MAX_DICE_PRESETS;

  /** Il GM svuota il registro di tutti e i propri tiri nascosti. */
  async function clearLog() {
    if (!("gmToken" in auth)) return;
    setConfirmClear(false);
    setError(null);
    try {
      await api.clearRolls(roomId, auth.gmToken);
      useLocalRolls.getState().clearHidden();
    } catch (e) {
      setError(describeApiError(e));
    }
  }

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
        <button
          type="button"
          className="icon-button"
          aria-pressed={!soundMuted}
          title={soundMuted ? t("social.dice.soundEnable") : t("social.dice.soundDisable")}
          aria-label={soundMuted ? t("social.dice.soundEnable") : t("social.dice.soundDisable")}
          onClick={() => {
            const next = !soundMuted;
            setSoundMuted(next);
            storage.setDiceSoundMuted(next);
            if (!next) {
              playDiceRollSound(1);
            }
          }}
        >
          {soundMuted ? (
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          )}
        </button>
      </form>
      {parsed && <FormulaStats stats={parsed.stats} />}
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
        {log.map(({ roll: entry, secret }) => (
          <RollEntry
            key={`${secret ? "h" : "s"}-${entry.id}`}
            roll={entry}
            secret={secret}
            busy={busy}
            onReroll={() =>
              void roll(entry.label ? `${entry.formula} # ${entry.label}` : entry.formula)
            }
          />
        ))}
      </ol>
      {isGm &&
        log.length > 0 &&
        (confirmClear ? (
          <p className="small roll-clear">
            {t("social.dice.clearQuestion")}{" "}
            <button type="button" className="danger" onClick={() => void clearLog()}>
              {t("social.dice.clearConfirm")}
            </button>{" "}
            <button type="button" onClick={() => setConfirmClear(false)}>
              {t("social.dice.clearCancel")}
            </button>
          </p>
        ) : (
          <button type="button" className="small roll-clear" onClick={() => setConfirmClear(true)}>
            {t("social.dice.clear")}
          </button>
        ))}
    </div>
  );
}

/** Anteprima della formula scritta: minimo, media e massimo, prima di tirare. */
function FormulaStats({ stats }: { stats: DiceStats }) {
  const { t, i18n } = useTranslation();
  const format = (value: number) =>
    Number.isFinite(value)
      ? value.toLocaleString(i18n.resolvedLanguage, { maximumFractionDigits: 1 })
      : value > 0
        ? "∞"
        : "−∞";

  return (
    <p className="muted small roll-stats" aria-live="polite">
      {t("social.dice.statsMin", { value: format(stats.min) })}
      {stats.mean !== null && <> · {t("social.dice.statsMean", { value: format(stats.mean) })}</>}
      {" · "}
      {t("social.dice.statsMax", { value: format(stats.max) })}
    </p>
  );
}

/** Un d20 tenuto è uscito 20 (critico) o 1 (fallimento critico)? Le riserve a soglia non contano. */
export function naturalD20(roll: Pick<Roll, "terms">): "crit" | "fumble" | null {
  const faces = roll.terms.flatMap((term) =>
    term.kind === "dice" && term.sides === 20 && !term.success
      ? term.dice.filter((_, i) => term.kept[i])
      : [],
  );
  if (faces.includes(20)) return "crit";
  if (faces.includes(1)) return "fumble";
  return null;
}

interface RollEntryProps {
  roll: Roll;
  secret: boolean;
  busy: boolean;
  /** Tira di nuovo la stessa formula. */
  onReroll: () => void;
}

function RollEntry({ roll, secret, busy, onReroll }: RollEntryProps) {
  const { t, i18n } = useTranslation();
  const natural = naturalD20(roll);
  const timeLocale = i18n.resolvedLanguage?.startsWith("en") ? "en-US" : "it-IT";

  return (
    <li className={secret ? "roll-entry secret" : "roll-entry"}>
      <span className="roll-head">
        <strong>{roll.name}</strong>{" "}
        {roll.from === "gm" && <span className="badge role-badge">GM</span>}{" "}
        <button
          type="button"
          className="roll-again muted"
          disabled={busy}
          title={t("social.dice.rerollTitle")}
          aria-label={t("social.dice.reroll", { formula: roll.formula })}
          onClick={onReroll}
        >
          {roll.formula}
        </button>
        {roll.label && <span className="roll-label"> {roll.label}</span>}
        {secret && <span className="muted small"> {t("social.dice.hiddenSuffix")}</span>}{" "}
        <time className="roll-time muted small" dateTime={roll.at}>
          {new Date(roll.at).toLocaleTimeString(timeLocale, { hour: "2-digit", minute: "2-digit" })}
        </time>
      </span>
      <span className="roll-detail muted small">{describeRoll(roll)}</span>
      <output
        className={natural ? `roll-total ${natural}` : "roll-total"}
        aria-label={[
          t("social.dice.total", { name: roll.name }),
          natural && t(`social.dice.${natural}`),
        ]
          .filter(Boolean)
          .join(", ")}
        title={natural ? t(`social.dice.${natural}`) : undefined}
      >
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
