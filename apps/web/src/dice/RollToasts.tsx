import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { Roll } from "@scryboard/shared";
import { useEffect, useRef, useState } from "react";
import { useLocalRolls, useRolls } from "./rolls";

const TOAST_MS = 6000;

interface Toast {
  roll: Roll;
  secret: boolean;
}

/**
 * Tiri sulla lavagna: ogni nuovo tiro compare per qualche secondo in un angolo. Quelli già nel
 * registro quando si entra non vengono ripetuti.
 */
export function RollToasts({ provider }: { provider: HocuspocusProvider }) {
  const shared = useRolls(provider);
  const hidden = useLocalRolls((s) => s.hidden);
  const seen = useRef<Set<string> | null>(null);
  const [synced, setSynced] = useState(provider.synced);
  useEffect(() => {
    const onSynced = () => setSynced(true);
    provider.on("synced", onSynced);
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
    setToasts((current) => [...current, ...fresh].slice(-4));
    for (const toast of fresh) {
      setTimeout(
        () => setToasts((current) => current.filter((t) => t.roll.id !== toast.roll.id)),
        TOAST_MS,
      );
    }
  }, [shared, hidden, synced]);

  if (toasts.length === 0) return null;
  return (
    <div className="roll-toasts" role="status" aria-label="Ultimi tiri">
      {toasts.map(({ roll, secret }) => (
        <div key={roll.id} className={secret ? "roll-toast secret" : "roll-toast"}>
          <span className="roll-toast-total">{roll.total}</span>
          <span className="roll-toast-text">
            <strong>{roll.name}</strong> · {roll.formula}
            {secret && " (nascosto)"}
          </span>
        </div>
      ))}
    </div>
  );
}
