import type { HocuspocusProvider } from "@hocuspocus/provider";
import {
  DiceError,
  MAX_REPEAT,
  ROLLS_MAP,
  type Roll,
  rollSchema,
  splitRepeat,
} from "@scryboard/shared";
import { useEffect, useState } from "react";
import { create } from "zustand";
import i18n from "../i18n";
import { api, describeApiError } from "../lib/api";

export type Auth = { gmToken: string } | { credentials: string };

interface LocalRolls {
  /** Tiri nascosti del GM: restano in questo browser, non vengono condivisi. */
  hidden: Roll[];
  addHidden: (roll: Roll) => void;
}

export const useLocalRolls = create<LocalRolls>((set) => ({
  hidden: [],
  addHidden: (roll) => set((s) => ({ hidden: [...s.hidden, roll].slice(-50) })),
}));

/** Tira sul server; un tiro nascosto si aggiunge al registro locale del GM. */
export async function rollFormula(
  roomId: string,
  formula: string,
  name: string,
  auth: Auth,
  hidden = false,
): Promise<Roll> {
  const roll = await api.roll(roomId, { formula, name, ...(hidden ? { hidden } : {}) }, auth);
  if (hidden) useLocalRolls.getState().addHidden(roll);
  return roll;
}

/** «3x 1d20+5»: tira la formula più volte, un tiro dopo l'altro (più attacchi in un turno). */
export async function rollRepeated(
  roomId: string,
  input: string,
  name: string,
  auth: Auth,
  hidden = false,
): Promise<Roll[]> {
  const { times, formula } = splitRepeat(input);
  const rolls: Roll[] = [];
  for (let i = 0; i < times; i++)
    rolls.push(await rollFormula(roomId, formula, name, auth, hidden));
  return rolls;
}

/** Messaggio per un tiro non riuscito, comprese le ripetizioni fuori misura. */
export function describeRollError(error: unknown): string {
  if (error instanceof DiceError) return i18n.t("social.dice.tooManyRepeats", { max: MAX_REPEAT });
  return describeApiError(error);
}

/** Registro condiviso dei tiri, dal più vecchio al più recente. */
export function useRolls(provider: HocuspocusProvider | null): Roll[] {
  const [rolls, setRolls] = useState<Roll[]>([]);
  useEffect(() => {
    if (!provider) return;
    const map = provider.document.getMap<unknown>(ROLLS_MAP);
    const update = () =>
      setRolls(
        [...map.values()]
          .flatMap((value) => {
            const parsed = rollSchema.safeParse(value);
            return parsed.success ? [parsed.data] : [];
          })
          .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1)),
      );
    update();
    map.observe(update);
    return () => map.unobserve(update);
  }, [provider]);
  return rolls;
}
