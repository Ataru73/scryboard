import { z } from "zod";

/** Limiti di una formula: servono a non far girare il server su tiri assurdi. */
export const MAX_DICE_PER_TERM = 100;
export const MAX_SIDES = 1000;
export const MAX_TERMS = 20;
export const MAX_FORMULA_LENGTH = 100;
export const MAX_CONSTANT = 10000;
/** Dadi in più che un termine può guadagnare esplodendo: oltre, l'esplosione si ferma. */
export const MAX_EXPLOSIONS = 100;

export class DiceError extends Error {}

export type KeepMode = "kh" | "kl" | "dh" | "dl";

/** Confronto di una soglia di successo: «>=7» conta i dadi che escono 7 o più. */
export const SUCCESS_OPS = [">=", ">", "<=", "<", "="] as const;
export type SuccessOp = (typeof SUCCESS_OPS)[number];

export interface Success {
  op: SuccessOp;
  value: number;
}

export type DiceSpec =
  | {
      kind: "dice";
      sign: 1 | -1;
      count: number;
      sides: number;
      keep?: { mode: KeepMode; n: number };
      /** Esplode: ogni dado che esce almeno questo valore ne fa tirare un altro. */
      explode?: number;
      /** Con una soglia il termine vale il numero di dadi che la raggiungono, non la loro somma. */
      success?: Success;
    }
  | { kind: "number"; sign: 1 | -1; value: number };

/** Il dado `face` soddisfa la soglia? */
export function meetsSuccess(face: number, success: Success): boolean {
  switch (success.op) {
    case ">=":
      return face >= success.value;
    case ">":
      return face > success.value;
    case "<=":
      return face <= success.value;
    case "<":
      return face < success.value;
    case "=":
      return face === success.value;
  }
}

/** `NdM`, poi in quest'ordine: tieni/scarta (`kh2`), esplosione (`!` o `!9`), successi (`>=7`). */
const TERM =
  /^(?:(\d*)d(\d+|%)(?:(kh|kl|dh|dl|k)(\d*))?(?:(!)(\d*))?(?:(>=|<=|>|<|=)(\d+))?|(\d+))$/;

/** Legge `2d20kh1+5`, `8d6`, `4d6dl1`, `10d10!>=7`, `d%`… in una lista di termini con segno. */
export function parseDice(input: string): DiceSpec[] {
  const formula = input.toLowerCase().replace(/\s+/g, "");
  if (!formula) throw new DiceError("Scrivi una formula, ad esempio 2d6+3.");
  if (formula.length > MAX_FORMULA_LENGTH) throw new DiceError("Formula troppo lunga.");
  const parts = formula.match(/[+-]?[^+-]+/g);
  if (!parts || parts.join("") !== formula) throw new DiceError(`Formula non valida: «${input}».`);
  if (parts.length > MAX_TERMS) throw new DiceError(`Al massimo ${MAX_TERMS} termini.`);
  return parts.map((part, index): DiceSpec => {
    const sign: 1 | -1 = part.startsWith("-") ? -1 : 1;
    const body = part.replace(/^[+-]/, "");
    if (index > 0 && !/^[+-]/.test(part)) throw new DiceError(`Formula non valida: «${input}».`);
    const match = TERM.exec(body);
    if (!match) throw new DiceError(`Termine non valido: «${body}».`);
    if (match[9] !== undefined) {
      const value = Number(match[9]);
      if (value > MAX_CONSTANT) throw new DiceError("Numero troppo grande.");
      return { kind: "number", sign, value };
    }
    const count = match[1] === "" ? 1 : Number(match[1]);
    const sides = match[2] === "%" ? 100 : Number(match[2]);
    if (count < 1 || count > MAX_DICE_PER_TERM) {
      throw new DiceError(`Da 1 a ${MAX_DICE_PER_TERM} dadi per termine.`);
    }
    if (sides < 2 || sides > MAX_SIDES) {
      throw new DiceError(`I dadi hanno da 2 a ${MAX_SIDES} facce.`);
    }
    const spec: Extract<DiceSpec, { kind: "dice" }> = { kind: "dice", sign, count, sides };
    if (match[3]) {
      const mode: KeepMode = match[3] === "k" ? "kh" : (match[3] as KeepMode);
      const n = match[4] === "" ? 1 : Number(match[4]);
      if (n >= count && (mode === "dh" || mode === "dl")) {
        throw new DiceError("Non puoi scartare tutti i dadi.");
      }
      if (n < 1 || n > count) {
        throw new DiceError(`«${match[3]}${match[4]}» non ha senso con ${count} dadi.`);
      }
      spec.keep = { mode, n };
    }
    if (match[5]) {
      // «!» esplode sul valore massimo; «!9» da 9 in su. Esplodere su 1 non finirebbe mai.
      const threshold = match[6] === "" ? sides : Number(match[6]);
      if (threshold < 2 || threshold > sides) {
        throw new DiceError(`L'esplosione «!${match[6]}» deve stare tra 2 e ${sides}.`);
      }
      spec.explode = threshold;
    }
    if (match[7]) {
      const value = Number(match[8]);
      if (value < 1 || value > sides) {
        throw new DiceError(`La soglia «${match[7]}${match[8]}» deve stare tra 1 e ${sides}.`);
      }
      spec.success = { op: match[7] as SuccessOp, value };
    }
    return spec;
  });
}

/** Formula in forma canonica: minuscola, senza spazi, `d` con il numero di dadi. */
export function formatDice(specs: DiceSpec[]): string {
  return specs
    .map((spec, i) => {
      const sign = spec.sign === -1 ? "-" : i > 0 ? "+" : "";
      if (spec.kind === "number") return `${sign}${spec.value}`;
      const keep = spec.keep ? `${spec.keep.mode}${spec.keep.n}` : "";
      const explode = spec.explode ? (spec.explode === spec.sides ? "!" : `!${spec.explode}`) : "";
      const success = spec.success ? `${spec.success.op}${spec.success.value}` : "";
      return `${sign}${spec.count}d${spec.sides}${keep}${explode}${success}`;
    })
    .join("");
}

const MAX_FACES = MAX_DICE_PER_TERM + MAX_EXPLOSIONS;

const rollTermSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("dice"),
    sign: z.union([z.literal(1), z.literal(-1)]),
    count: z.number().int(),
    sides: z.number().int(),
    /** Valori usciti, nell'ordine del tiro (in coda quelli dell'esplosione), e quali contano. */
    dice: z.array(z.number().int()).max(MAX_FACES),
    kept: z.array(z.boolean()).max(MAX_FACES),
    /** Per ogni dado: è uscito da un'esplosione. Assente nei tiri senza esplosione. */
    extra: z.array(z.boolean()).max(MAX_FACES).optional(),
    /** Soglia di successo e dadi che l'hanno raggiunta: il termine vale `successes`. */
    success: z.object({ op: z.enum(SUCCESS_OPS), value: z.number().int() }).optional(),
    successes: z.number().int().optional(),
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
    const extra = dice.map(() => false);
    if (spec.explode) {
      // Ogni dado che raggiunge la soglia ne fa tirare un altro, anche a catena, fino al tetto.
      let added = 0;
      for (let i = 0; i < dice.length && added < MAX_EXPLOSIONS; i++) {
        if ((dice[i] as number) >= spec.explode) {
          dice.push(random(spec.sides));
          extra.push(true);
          added++;
        }
      }
    }
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
    const base = { kind: "dice" as const, sign: spec.sign, count: spec.count, sides: spec.sides };
    const exploded = spec.explode ? { extra } : {};
    if (spec.success) {
      const threshold = spec.success;
      const successes = dice.filter((v, i) => kept[i] && meetsSuccess(v, threshold)).length;
      total += spec.sign * successes;
      return { ...base, dice, kept, ...exploded, success: threshold, successes };
    }
    total += spec.sign * dice.reduce((sum, v, i) => sum + (kept[i] ? v : 0), 0);
    return { ...base, dice, kept, ...exploded };
  });
  return { formula: formatDice(specs), terms, total };
}

/**
 * Come si legge un tiro nel registro: «2d20kh1 [18, ~7] + 5 = 23». I dadi scartati hanno una
 * tilde, quelli usciti da un'esplosione un asterisco; con una soglia il termine mostra i
 * successi («10d10!>=7 [8, 10, *9, 3] → 3»).
 */
export function describeRoll(roll: Pick<Roll, "terms" | "total">): string {
  const parts = roll.terms.map((term, i) => {
    const sign = term.sign === -1 ? "- " : i > 0 ? "+ " : "";
    if (term.kind === "number") return `${sign}${term.value}`;
    const faces = term.dice
      .map((v, k) => `${term.extra?.[k] ? "*" : ""}${term.kept[k] ? "" : "~"}${v}`)
      .join(", ");
    const mods = [
      term.extra ? "!" : "",
      term.success ? `${term.success.op}${term.success.value}` : "",
    ].join("");
    const outcome = term.successes !== undefined ? ` → ${term.successes}` : "";
    return `${sign}${term.count}d${term.sides}${mods} [${faces}]${outcome}`;
  });
  return `${parts.join(" ")} = ${roll.total}`;
}
