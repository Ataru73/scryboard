import type { HocuspocusProvider } from "@hocuspocus/provider";
import { meetsSuccess, type Roll, type Success } from "@scryboard/shared";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocalRolls, useRolls } from "./rolls";

const TOAST_MS = 6200;
const MAX_VISIBLE_DICE = 16;
const BASE_ROLL_MS = 900;
const EXPLODE_ROLL_MS = 750;

interface Toast {
  roll: Roll;
  secret: boolean;
}

interface DieItem {
  key: string;
  sides: number;
  value: number;
  sign: 1 | -1;
  kept: boolean;
  extra: boolean;
  success?: Success;
}

/** Estrae i singoli dadi e l'eventuale modificatore fisso da mostrare sulla lavagna. */
function flattenRoll(roll: Roll): { dice: DieItem[]; modifier: number; hasSuccessPool: boolean } {
  const dice: DieItem[] = [];
  let modifier = 0;
  let hasSuccessPool = false;

  roll.terms.forEach((term, termIdx) => {
    if (term.kind === "number") {
      modifier += term.sign * term.value;
      return;
    }
    if (term.success) hasSuccessPool = true;
    term.dice.forEach((value, dieIdx) => {
      dice.push({
        key: `${termIdx}-${dieIdx}`,
        sides: term.sides,
        value,
        sign: term.sign,
        kept: term.kept[dieIdx] ?? true,
        extra: term.extra?.[dieIdx] ?? false,
        success: term.success,
      });
    });
  });

  return { dice, modifier, hasSuccessPool };
}

/** Sagoma poligonale e sfaccettature interne in base al numero di facce del dado. */
function DieShape({ sides }: { sides: number }) {
  if (sides === 4) {
    return (
      <svg className="die-svg" viewBox="0 0 56 56" aria-hidden="true">
        <polygon className="die-poly" points="28,5 52,48 4,48" strokeLinejoin="round" />
        <polyline className="die-facet" points="28,5 28,34 4,48" />
        <line className="die-facet" x1="28" y1="34" x2="52" y2="48" />
      </svg>
    );
  }
  if (sides === 6) {
    return (
      <svg className="die-svg" viewBox="0 0 56 56" aria-hidden="true">
        <rect className="die-poly" x="7" y="7" width="42" height="42" rx="8" />
        <rect className="die-facet" x="13" y="13" width="30" height="30" rx="4" />
      </svg>
    );
  }
  if (sides === 8) {
    return (
      <svg className="die-svg" viewBox="0 0 56 56" aria-hidden="true">
        <polygon className="die-poly" points="28,3 52,28 28,53 4,28" strokeLinejoin="round" />
        <polygon className="die-facet" points="28,3 46,28 10,28" strokeLinejoin="round" />
        <line className="die-facet" x1="10" y1="28" x2="28" y2="53" />
        <line className="die-facet" x1="46" y1="28" x2="28" y2="53" />
      </svg>
    );
  }
  if (sides === 10 || sides === 100) {
    return (
      <svg className="die-svg" viewBox="0 0 56 56" aria-hidden="true">
        <polygon className="die-poly" points="28,3 52,24 28,53 4,24" strokeLinejoin="round" />
        <polyline className="die-facet" points="4,24 28,33 52,24" />
        <line className="die-facet" x1="28" y1="3" x2="28" y2="33" />
        <line className="die-facet" x1="28" y1="33" x2="28" y2="53" />
      </svg>
    );
  }
  if (sides === 12) {
    return (
      <svg className="die-svg" viewBox="0 0 56 56" aria-hidden="true">
        <polygon className="die-poly" points="28,3 52,21 43,50 13,50 4,21" strokeLinejoin="round" />
        <polygon
          className="die-facet"
          points="28,12 43,23 37,42 19,42 13,23"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  // d20 e qualsiasi altro taglio usano l'icosaedro esagonale.
  return (
    <svg className="die-svg" viewBox="0 0 56 56" aria-hidden="true">
      <polygon
        className="die-poly"
        points="28,3 50,16 50,40 28,53 6,40 6,16"
        strokeLinejoin="round"
      />
      <polygon className="die-facet" points="28,11 43,37 13,37" strokeLinejoin="round" />
      <line className="die-facet" x1="28" y1="3" x2="28" y2="11" />
      <line className="die-facet" x1="50" y1="16" x2="43" y2="37" />
      <line className="die-facet" x1="6" y1="16" x2="13" y2="37" />
      <line className="die-facet" x1="28" y1="53" x2="13" y2="37" />
      <line className="die-facet" x1="28" y1="53" x2="43" y2="37" />
    </svg>
  );
}

/** Singolo dado animato: mentre rotola scorre rapidamente le facce prima di fermarsi sul valore estratto. */
function AnimatedDie({
  die,
  index,
  delayMs,
  durationMs,
}: {
  die: DieItem;
  index: number;
  delayMs: number;
  durationMs: number;
}) {
  const [face, setFace] = useState(die.value);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    setSettled(false);
    let step = index + 1;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startTimer = setTimeout(() => {
      intervalId = setInterval(() => {
        step = (step * 7 + 3) % die.sides;
        setFace(step + 1);
      }, 55);
    }, delayMs);

    const stopTimer = setTimeout(() => {
      if (intervalId !== null) clearInterval(intervalId);
      setFace(die.value);
      setSettled(true);
    }, delayMs + durationMs);

    return () => {
      clearTimeout(startTimer);
      clearTimeout(stopTimer);
      if (intervalId !== null) clearInterval(intervalId);
    };
  }, [die.sides, die.value, delayMs, durationMs, index]);

  const isSuccess = die.kept && die.success ? meetsSuccess(die.value, die.success) : undefined;
  const isCritMax = die.kept && !die.success && die.sides >= 4 && die.value === die.sides;
  const isCritMin = die.kept && !die.success && die.sides === 20 && die.value === 1;
  // Angolo e direzione di lancio per dare l'effetto di dadi tirati sul tavolo.
  const restAngle = (((index * 37 + die.value * 13) % 19) - 9) * (die.kept ? 1 : 0.5);
  const throwX = ((index % 2 === 0 ? -1 : 1) * (24 + ((index * 17) % 28))).toFixed(0);
  const throwY = (-32 - ((index * 13) % 22)).toFixed(0);
  const spinStart = (index % 2 === 0 ? -540 : 540) + restAngle;

  const classes = [
    "roll-die",
    `die-d${die.sides}`,
    settled ? "settled" : "rolling",
    die.extra ? "exploded" : "",
    settled && !die.kept ? "discarded" : "",
    settled && isSuccess === true ? "success" : "",
    settled && isSuccess === false ? "fail" : "",
    settled && isCritMax ? "crit-max" : "",
    settled && isCritMin ? "crit-min" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      style={
        {
          "--die-delay": `${delayMs}ms`,
          "--die-duration": `${durationMs}ms`,
          "--die-rest": `${restAngle}deg`,
          "--die-throw-x": `${throwX}px`,
          "--die-throw-y": `${throwY}px`,
          "--die-spin-start": `${spinStart}deg`,
        } as CSSProperties
      }
    >
      <DieShape sides={die.sides} />
      <span className="die-value">{die.sign === -1 ? `-${face}` : face}</span>
      <span className="die-tag">d{die.sides}</span>
    </div>
  );
}

/**
 * Scheda di un singolo tiro: mostra prima solo i dadi iniziali e rivela eventuali dadi esplosi
 * (allargando il riquadro) e il totale solo quando i dadi iniziali si sono fermati.
 */
function RollToastCard({ roll, secret }: Toast) {
  const { t } = useTranslation();
  const { dice, modifier, hasSuccessPool } = flattenRoll(roll);
  const visibleDice = dice.slice(0, MAX_VISIBLE_DICE);
  const hiddenCount = dice.length - visibleDice.length;

  const baseDice = visibleDice.filter((d) => !d.extra);
  const explodedDice = visibleDice.filter((d) => d.extra);

  const baseDoneMs =
    baseDice.length > 0 ? 60 + Math.min((baseDice.length - 1) * 65, 390) + BASE_ROLL_MS : 0;
  const totalDoneMs =
    explodedDice.length > 0
      ? baseDoneMs + Math.min((explodedDice.length - 1) * 75, 300) + EXPLODE_ROLL_MS
      : baseDoneMs;

  const [showExploded, setShowExploded] = useState(explodedDice.length === 0);
  const [totalReady, setTotalReady] = useState(visibleDice.length === 0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (explodedDice.length > 0) {
      timers.push(setTimeout(() => setShowExploded(true), baseDoneMs));
    }
    if (visibleDice.length > 0) {
      timers.push(setTimeout(() => setTotalReady(true), totalDoneMs));
    }
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [baseDoneMs, explodedDice.length, totalDoneMs, visibleDice.length]);

  return (
    <div className={secret ? "roll-toast secret" : "roll-toast"}>
      <div className="roll-toast-header">
        <strong>{roll.name}</strong>
        <span className="roll-toast-formula">{roll.formula}</span>
        {secret && <span className="roll-toast-secret">{t("social.dice.hiddenSuffix")}</span>}
      </div>
      <div className="roll-toast-tray" aria-hidden="true">
        {baseDice.map((die, index) => (
          <AnimatedDie
            key={`${roll.id}-${die.key}`}
            die={die}
            index={index}
            delayMs={60 + Math.min(index * 65, 390)}
            durationMs={BASE_ROLL_MS}
          />
        ))}
        {showExploded &&
          explodedDice.map((die, expIndex) => (
            <AnimatedDie
              key={`${roll.id}-${die.key}`}
              die={die}
              index={baseDice.length + expIndex}
              delayMs={Math.min(expIndex * 75, 300)}
              durationMs={EXPLODE_ROLL_MS}
            />
          ))}
        {(!explodedDice.length || showExploded) && hiddenCount > 0 && (
          <span className="roll-die-more">+{hiddenCount}</span>
        )}
        {modifier !== 0 && !hasSuccessPool && (
          <span className="roll-die-mod">{modifier > 0 ? `+${modifier}` : modifier}</span>
        )}
      </div>
      <div className={totalReady ? "roll-toast-footer ready" : "roll-toast-footer pending"}>
        <span className="roll-toast-total">{totalReady ? roll.total : "…"}</span>
        {totalReady && hasSuccessPool && (
          <span className="roll-toast-unit">
            {t("social.dice.successes", { count: Math.abs(roll.total) })}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Tiri sulla lavagna: ogni nuovo tiro compare al centro con i dadi 2D animati per qualche secondo.
 * Quelli già nel registro quando si entra non vengono ripetuti.
 */
export function RollToasts({ provider }: { provider: HocuspocusProvider }) {
  const { t } = useTranslation();
  const shared = useRolls(provider);
  const hidden = useLocalRolls((s) => s.hidden);
  const seen = useRef<Set<string> | null>(null);
  const [synced, setSynced] = useState(provider.synced);
  useEffect(() => {
    const onSynced = () => setSynced(true);
    provider.on("synced", onSynced);
    if (provider.synced) setSynced(true);
    return () => {
      provider.off("synced", onSynced);
    };
  }, [provider]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (!synced) return;
    // Il primo giro, con il registro appena sincronizzato, serve solo a ricordare cosa c'è già.
    if (seen.current === null) {
      seen.current = new Set(shared.map((r) => r.id));
      return;
    }
    const fresh: Toast[] = [];
    for (const roll of shared) {
      if (!seen.current.has(roll.id)) {
        seen.current.add(roll.id);
        fresh.push({ roll, secret: false });
      }
    }
    for (const roll of hidden) {
      if (!seen.current.has(roll.id)) {
        seen.current.add(roll.id);
        fresh.push({ roll, secret: true });
      }
    }
    if (fresh.length === 0) return;
    setToasts((current) => [...current, ...fresh].slice(-2));
    for (const toast of fresh) {
      setTimeout(
        () => setToasts((current) => current.filter((t) => t.roll.id !== toast.roll.id)),
        TOAST_MS,
      );
    }
  }, [shared, hidden, synced]);

  if (toasts.length === 0) return null;
  return (
    <div className="roll-toasts" role="status" aria-label={t("social.dice.recent")}>
      {toasts.map(({ roll, secret }) => (
        <RollToastCard key={roll.id} roll={roll} secret={secret} />
      ))}
    </div>
  );
}
