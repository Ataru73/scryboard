import { z } from "zod";

/** Limiti di una formula: servono a non far girare il server su tiri assurdi. */
export const MAX_DICE_PER_TERM = 100;
export const MAX_SIDES = 1000;
export const MAX_TERMS = 20;
export const MAX_FORMULA_LENGTH = 100;
export const MAX_CONSTANT = 10000;

export class DiceError extends Error {}

export type KeepMode = "kh" | "kl" | "dh" | "dl";

export type DiceSpec =
  | {
      kind: "dice";
      sign: 1 | -1;
      count: number;
      sides: number;
      keep?: { mode: KeepMode; n: number };
    }
  | { kind: "number"; sign: 1 | -1; value: number };

const TERM = /^(?:(\d*)d(\d+|%)(?:(kh|kl|dh|dl|k)(\d*))?|(\d+))$/;

/** Legge `2d20kh1+5`, `8d6`, `4d6dl1`, `d%`… in una lista di termini con segno. */
export function parseDice(input: string): DiceSpec[] {
  const formula = input.toLowerCase().replace(/\s+/g, "");
  if (!formula) throw new DiceError("Scrivi una formula, ad esempio 2d6+3.");
  if (formula.length > MAX_FORMULA_LENGTH) throw new DiceError("Formula troppo lunga.");
  const parts = formula.match(/[+-]?[^+-]+/g);
  if (!parts || parts.join("") !== formula) throw new DiceError(`Formula non valida: «${input}».`);
  if (parts.length > MAX_TERMS) throw new DiceError(`Al massimo ${MAX_TERMS} termini.`);
  return parts.map((part, index) => {
    const sign: 1 | -1 = part.startsWith("-") ? -1 : 1;
    const body = part.replace(/^[+-]/, "");
    if (index > 0 && !/^[+-]/.test(part)) throw new DiceError(`Formula non valida: «${input}».`);
    const match = TERM.exec(body);
    if (!match) throw new DiceError(`Termine non valido: «${body}».`);
    if (match[5] !== undefined) {
      const value = Number(match[5]);
      if (value > MAX_CONSTANT) throw new DiceError("Numero troppo grande.");
      return { kind: "number", sign, value };
    }
    const count = match[1] === "" ? 1 : Number(match[1]);
    const sides = match[2] === "%" ? 100 : Number(match[2]);
    if (count < 1 || count > MAX_DICE_PER_TERM) {
      throw new DiceError(`Da 1 a ${MAX_DICE_PER_TERM} dadi per termine.`);
    }
    if (sides < 2 || sides > MAX_SIDES)
      throw new DiceError(`I dadi hanno da 2 a ${MAX_SIDES} facce.`);
    if (!match[3]) return { kind: "dice", sign, count, sides };
    const mode: KeepMode = match[3] === "k" ? "kh" : (match[3] as KeepMode);
    const n = match[4] === "" ? 1 : Number(match[4]);
    if (n >= count && (mode === "dh" || mode === "dl")) {
      throw new DiceError("Non puoi scartare tutti i dadi.");
    }
    if (n < 1 || n > count)
      throw new DiceError(`«${match[3]}${match[4]}» non ha senso con ${count} dadi.`);
    return { kind: "dice", sign, count, sides, keep: { mode, n } };
  });
}

/** Formula in forma canonica: minuscola, senza spazi, `d` con il numero di dadi. */
export function formatDice(specs: DiceSpec[]): string {
  return specs
    .map((spec, i) => {
      const sign = spec.sign === -1 ? "-" : i > 0 ? "+" : "";
      if (spec.kind === "number") return `${sign}${spec.value}`;
      const keep = spec.keep ? `${spec.keep.mode}${spec.keep.n}` : "";
      return `${sign}${spec.count}d${spec.sides}${keep}`;
    })
    .join("");
}

const rollTermSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("dice"),
    sign: z.union([z.literal(1), z.literal(-1)]),
    count: z.number().int(),
    sides: z.number().int(),
    /** Valori usciti, nell'ordine del tiro, e quali contano nel totale. */
    dice: z.array(z.number().int()).max(MAX_DICE_PER_TERM),
    kept: z.array(z.boolean()).max(MAX_DICE_PER_TERM),
  }),
  z.object({
    kind: z.literal("number"),
    sign: z.union([z.literal(1), z.literal(-1)]),
    value: z.number(),
  }),
]);

/** Nome della Y.Map con i tiri pubblici nel documento pubblico (li scrive solo il server). */
export const ROLLS_MAP = "rolls";
/** Quanti tiri tiene il registro: il server cancella i più vecchi. */
export const MAX_ROLLS = 200;

export const rollSchema = z.object({
  id: z.string().min(1).max(64),
  /** "gm" o l'id del profilo del giocatore. */
  from: z.string().max(64),
  name: z.string().max(40),
  formula: z.string().max(MAX_FORMULA_LENGTH),
  terms: z.array(rollTermSchema).max(MAX_TERMS),
  total: z.number(),
  at: z.iso.datetime(),
});
export type Roll = z.infer<typeof rollSchema>;
export type RollTerm = Roll["terms"][number];

export const rollRequestSchema = z.object({
  formula: z.string().trim().min(1).max(MAX_FORMULA_LENGTH),
  /** Nome con cui firma chi tira. */
  name: z.string().trim().min(1).max(32),
  /** Solo il GM: il tiro si vede solo nella risposta, non viene condiviso. */
  hidden: z.boolean().optional(),
});
export type RollRequest = z.infer<typeof rollRequestSchema>;

/** Tira i dadi di una formula. `random(sides)` restituisce un intero tra 1 e `sides`. */
export function rollDice(
  input: string,
  random: (sides: number) => number,
): Pick<Roll, "formula" | "terms" | "total"> {
  const specs = parseDice(input);
  let total = 0;
  const terms = specs.map((spec): RollTerm => {
    if (spec.kind === "number") {
      total += spec.sign * spec.value;
      return { kind: "number", sign: spec.sign, value: spec.value };
    }
    const dice = Array.from({ length: spec.count }, () => random(spec.sides));
    const kept = dice.map(() => true);
    if (spec.keep) {
      const order = dice
        .map((_, i) => i)
        .sort((a, b) => (dice[a] as number) - (dice[b] as number) || a - b);
      const fromHigh = spec.keep.mode === "kh" || spec.keep.mode === "dl";
      const ranked = fromHigh ? [...order].reverse() : order;
      // kh/kl tengono i primi n del ranking; dl/dh scartano i primi n dell'altro ranking.
      const keepCount =
        spec.keep.mode === "kh" || spec.keep.mode === "kl"
          ? spec.keep.n
          : dice.length - spec.keep.n;
      const keepSet = new Set(ranked.slice(0, keepCount));
      for (let i = 0; i < dice.length; i++) kept[i] = keepSet.has(i);
    }
    total += spec.sign * dice.reduce((sum, v, i) => sum + (kept[i] ? v : 0), 0);
    return { kind: "dice", sign: spec.sign, count: spec.count, sides: spec.sides, dice, kept };
  });
  return { formula: formatDice(specs), terms, total };
}

/** "2d20kh1 [18, ~7] + 5 = 23": come si legge un tiro nel registro. */
export function describeRoll(roll: Pick<Roll, "terms" | "total">): string {
  const parts = roll.terms.map((term, i) => {
    const sign = term.sign === -1 ? "- " : i > 0 ? "+ " : "";
    if (term.kind === "number") return `${sign}${term.value}`;
    const faces = term.dice.map((v, k) => (term.kept[k] ? String(v) : `~${v}`)).join(", ");
    return `${sign}${term.count}d${term.sides} [${faces}]`;
  });
  return `${parts.join(" ")} = ${roll.total}`;
}
