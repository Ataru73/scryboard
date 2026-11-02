import { z } from "zod";

/** Limiti di una formula: servono a non far girare il server su tiri assurdi. */
export const MAX_DICE_PER_TERM = 100;
export const MAX_SIDES = 1000;
export const MAX_TERMS = 20;
export const MAX_FORMULA_LENGTH = 100;
export const MAX_CONSTANT = 10000;
/** Dadi in più che un termine può guadagnare esplodendo: oltre, l'esplosione si ferma. */
export const MAX_EXPLOSIONS = 100;

/** Lunghezza massima dell'etichetta di un tiro («1d20+5 # Attacco»). */
export const MAX_ROLL_LABEL = 40;

export class DiceError extends Error {}

/** Quante volte si può ripetere una formula con «3x 1d20+5». */
export const MAX_REPEAT = 10;

/**
 * «3x 1d20+5 # Attacco»: quante volte tirare (1 se non è indicato) e il resto della formula.
 * Ogni ripetizione è un tiro a sé, come più attacchi nello stesso turno.
 */
export function splitRepeat(input: string): { times: number; formula: string } {
  const match = /^\s*(\d+)\s*[x×]\s*(?=\S)([\s\S]*)$/i.exec(input);
  if (!match) return { times: 1, formula: input };
  const times = Number(match[1]);
  if (times < 1 || times > MAX_REPEAT) {
    throw new DiceError(`Da 1 a ${MAX_REPEAT} ripetizioni.`);
  }
  return { times, formula: match[2] as string };
}

/** «1d20+5 # Attacco»: la formula e l'etichetta dopo il cancelletto, se c'è. */
export function splitRollLabel(input: string): { formula: string; label?: string } {
  const hash = input.indexOf("#");
  if (hash === -1) return { formula: input };
  const label = input
    .slice(hash + 1)
    .trim()
    .slice(0, MAX_ROLL_LABEL);
  return { formula: input.slice(0, hash), ...(label ? { label } : {}) };
}

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
      /** Ritira una volta i dadi che escono questo valore o meno, tenendo il nuovo risultato. */
      reroll?: number;
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

/**
 * `NdM`, poi in quest'ordine: ritira una volta (`ro2`), tieni/scarta (`kh2`), esplosione (`!` o
 * `!9`), successi (`>=7`).
 */
const TERM =
  /^(?:(\d*)d(\d+|%)(?:ro(\d+))?(?:(kh|kl|dh|dl|k)(\d*))?(?:(!)(\d*))?(?:(>=|<=|>|<|=)(\d+))?|(\d+))$/;

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
    if (match[10] !== undefined) {
      const value = Number(match[10]);
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
      // Ritirare ogni faccia renderebbe il dado inutile: almeno la più alta deve restare.
      const reroll = Number(match[3]);
      if (reroll < 1 || reroll >= sides) {
        throw new DiceError(`«ro${match[3]}» deve stare tra 1 e ${sides - 1}.`);
      }
      spec.reroll = reroll;
    }
    if (match[4]) {
      const mode: KeepMode = match[4] === "k" ? "kh" : (match[4] as KeepMode);
      const n = match[5] === "" ? 1 : Number(match[5]);
      if (n >= count && (mode === "dh" || mode === "dl")) {
        throw new DiceError("Non puoi scartare tutti i dadi.");
      }
      if (n < 1 || n > count) {
        throw new DiceError(`«${match[4]}${match[5]}» non ha senso con ${count} dadi.`);
      }
      spec.keep = { mode, n };
    }
    if (match[6]) {
      // «!» esplode sul valore massimo; «!9» da 9 in su. Esplodere su 1 non finirebbe mai.
      const threshold = match[7] === "" ? sides : Number(match[7]);
      if (threshold < 2 || threshold > sides) {
        throw new DiceError(`L'esplosione «!${match[7]}» deve stare tra 2 e ${sides}.`);
      }
      spec.explode = threshold;
    }
    if (match[8]) {
      const value = Number(match[9]);
      if (value < 1 || value > sides) {
        throw new DiceError(`La soglia «${match[8]}${match[9]}» deve stare tra 1 e ${sides}.`);
      }
      spec.success = { op: match[8] as SuccessOp, value };
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
      const reroll = spec.reroll ? `ro${spec.reroll}` : "";
      const keep = spec.keep ? `${spec.keep.mode}${spec.keep.n}` : "";
      const explode = spec.explode ? (spec.explode === spec.sides ? "!" : `!${spec.explode}`) : "";
      const success = spec.success ? `${spec.success.op}${spec.success.value}` : "";
      return `${sign}${spec.count}d${spec.sides}${reroll}${keep}${explode}${success}`;
    })
    .join("");
}

/** Ogni dado può essere ritirato una volta, e in più ci sono quelli dell'esplosione. */
const MAX_FACES = MAX_DICE_PER_TERM * 2 + MAX_EXPLOSIONS;

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
    /** Per ogni dado: è il nuovo tiro di un dado ritirato con `ro`. Assente se nessun dado è stato ritirato. */
    rerolled: z.array(z.boolean()).max(MAX_FACES).optional(),
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
  /** Per che cosa si tira («Attacco»), scritto dopo un «#» nella formula. */
  label: z.string().max(MAX_ROLL_LABEL).optional(),
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

/**
 * Tira i dadi di una formula, con un'etichetta facoltativa dopo «#». `random(sides)` restituisce
 * un intero tra 1 e `sides`.
 */
export function rollDice(
  input: string,
  random: (sides: number) => number,
): Pick<Roll, "formula" | "label" | "terms" | "total"> {
  const { formula, label } = splitRollLabel(input);
  const specs = parseDice(formula);
  let total = 0;
  const terms = specs.map((spec): RollTerm => {
    if (spec.kind === "number") {
      total += spec.sign * spec.value;
      return { kind: "number", sign: spec.sign, value: spec.value };
    }
    const dice = Array.from({ length: spec.count }, () => random(spec.sides));
    const extra = dice.map(() => false);
    const rerolled = dice.map(() => false);
    // I dadi sostituiti da un ritiro restano nel registro, ma non contano più per niente.
    const replaced = dice.map(() => false);
    const add = (value: number, exploded: boolean) => {
      dice.push(value);
      extra.push(exploded);
      rerolled.push(!exploded);
      replaced.push(false);
    };
    if (spec.reroll) {
      for (let i = 0; i < spec.count; i++) {
        if ((dice[i] as number) <= spec.reroll) {
          replaced[i] = true;
          add(random(spec.sides), false);
        }
      }
    }
    if (spec.explode) {
      // Ogni dado che raggiunge la soglia ne fa tirare un altro, anche a catena, fino al tetto.
      let added = 0;
      for (let i = 0; i < dice.length && added < MAX_EXPLOSIONS; i++) {
        if (!replaced[i] && (dice[i] as number) >= spec.explode) {
          add(random(spec.sides), true);
          added++;
        }
      }
    }
    const kept = replaced.map((r) => !r);
    if (spec.keep) {
      const order = dice
        .map((_, i) => i)
        .filter((i) => !replaced[i])
        .sort((a, b) => (dice[a] as number) - (dice[b] as number) || a - b);
      const fromHigh = spec.keep.mode === "kh" || spec.keep.mode === "dl";
      const ranked = fromHigh ? [...order].reverse() : order;
      // kh/kl tengono i primi n del ranking; dl/dh scartano i primi n dell'altro ranking.
      const keepCount =
        spec.keep.mode === "kh" || spec.keep.mode === "kl"
          ? spec.keep.n
          : order.length - spec.keep.n;
      const keepSet = new Set(ranked.slice(0, keepCount));
      for (let i = 0; i < dice.length; i++) kept[i] = keepSet.has(i);
    }
    const base = { kind: "dice" as const, sign: spec.sign, count: spec.count, sides: spec.sides };
    const exploded = {
      ...(spec.explode ? { extra } : {}),
      ...(rerolled.includes(true) ? { rerolled } : {}),
    };
    if (spec.success) {
      const threshold = spec.success;
      const successes = dice.filter((v, i) => kept[i] && meetsSuccess(v, threshold)).length;
      total += spec.sign * successes;
      return { ...base, dice, kept, ...exploded, success: threshold, successes };
    }
    total += spec.sign * dice.reduce((sum, v, i) => sum + (kept[i] ? v : 0), 0);
    return { ...base, dice, kept, ...exploded };
  });
  return { formula: formatDice(specs), ...(label ? { label } : {}), terms, total };
}

/**
 * Come si legge un tiro nel registro: «2d20kh1 [18, ~7] + 5 = 23». I dadi scartati hanno una
 * tilde, quelli usciti da un'esplosione un asterisco, i nuovi tiri di un ritiro una freccia; con una soglia il termine mostra i
 * successi («10d10!>=7 [8, 10, *9, 3] → 3»).
 */
export function describeRoll(roll: Pick<Roll, "terms" | "total">): string {
  const parts = roll.terms.map((term, i) => {
    const sign = term.sign === -1 ? "- " : i > 0 ? "+ " : "";
    if (term.kind === "number") return `${sign}${term.value}`;
    const faces = term.dice
      .map(
        (v, k) =>
          `${term.extra?.[k] ? "*" : ""}${term.rerolled?.[k] ? "↻" : ""}${term.kept[k] ? "" : "~"}${v}`,
      )
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

export interface DiceStats {
  /** Risultato più basso possibile; `-Infinity` se un termine sottratto esplode. */
  min: number;
  /** Risultato più alto possibile; `Infinity` se un termine esplode. */
  max: number;
  /** Media attesa, o `null` quando non si calcola in modo esatto (tieni/scarta con `!` o soglia). */
  mean: number | null;
}

/** Probabilità che almeno `j` dadi su `n` superino una prova che riesce con probabilità `q`. */
function atLeast(n: number, j: number, q: number): number {
  if (q === 1) return j <= n ? 1 : 0;
  // Distribuzione binomiale costruita per ricorrenza: niente fattoriali che traboccano.
  let pmf = (1 - q) ** n;
  let tail = 0;
  for (let i = 0; i <= n; i++) {
    if (i >= j) tail += pmf;
    pmf *= ((n - i) / (i + 1)) * (q / (1 - q));
  }
  return Math.min(1, tail);
}

/** Probabilità di ogni faccia (indice 0 = faccia 1) di un dado, ritirato una volta fino a `reroll`. */
function faceOdds(sides: number, reroll = 0): number[] {
  return Array.from(
    { length: sides },
    (_, i) => (i + 1 > reroll ? 1 / sides : 0) + reroll / sides / sides,
  );
}

/** Media della somma dei `k` dadi più alti (o più bassi) su `n` dadi con probabilità `odds`. */
function keptMean(n: number, odds: number[], k: number, high: boolean): number {
  const sides = odds.length;
  const below = (x: number) => odds.slice(0, x - 1).reduce((a, b) => a + b, 0);
  let mean = 0;
  // E[j-esimo più alto] = Σ_x P(almeno j dadi ≥ x); E[j-esimo più basso] = Σ_x P(meno di j dadi < x).
  for (let j = 1; j <= k; j++) {
    for (let x = 1; x <= sides; x++) {
      mean += high ? atLeast(n, j, 1 - below(x)) : 1 - atLeast(n, j, below(x));
    }
  }
  return mean;
}

/** Minimo, massimo e media di una formula, senza tirare: servono all'anteprima della formula. */
export function diceStats(specs: DiceSpec[]): DiceStats {
  let min = 0;
  let max = 0;
  let mean: number | null = 0;
  for (const spec of specs) {
    let lo: number;
    let hi: number;
    let avg: number | null;
    if (spec.kind === "number") {
      lo = hi = avg = spec.value;
    } else {
      const { count, sides, keep, explode, success, reroll } = spec;
      const odds = faceOdds(sides, reroll);
      // Senza ritiro si usano le formule esatte: le somme di probabilità perdono precisione.
      const chance = (test: (face: number) => boolean, exact: number) =>
        reroll ? odds.reduce((sum, p, i) => sum + (test(i + 1) ? p : 0), 0) : exact;
      const kept = !keep
        ? count
        : keep.mode === "kh" || keep.mode === "kl"
          ? keep.n
          : count - keep.n;
      // Probabilità che un dado esploda: ogni dado ne genera in media 1/(1-p). I dadi
      // dell'esplosione non si ritirano, quindi il primo dado ha probabilità sue.
      const pExplode = explode ? (sides - explode + 1) / sides : 0;
      const chain = 1 / (1 - pExplode);
      const firstExplode = explode ? chance((face) => face >= explode, pExplode) : 0;
      if (success) {
        let hits = 0;
        for (let face = 1; face <= sides; face++) if (meetsSuccess(face, success)) hits++;
        const pHit = hits / sides;
        lo = pHit === 1 ? kept : 0;
        hi = pHit === 0 ? 0 : explode ? Infinity : kept;
        // Con tieni/scarta la media dipende da quali dadi restano: si dà solo nei casi certi.
        const firstHit = chance((face) => meetsSuccess(face, success), pHit);
        if (!keep) avg = count * (firstHit + firstExplode * chain * pHit);
        else avg = !explode && (pHit === 0 || pHit === 1) ? pHit * kept : null;
      } else {
        lo = kept;
        hi = explode ? Infinity : kept * sides;
        const firstMean = reroll
          ? odds.reduce((sum, p, i) => sum + p * (i + 1), 0)
          : (sides + 1) / 2;
        if (!keep) avg = count * (firstMean + firstExplode * chain * ((sides + 1) / 2));
        else if (explode) avg = null;
        else {
          const high = keep.mode === "kh" || keep.mode === "dl";
          avg = keptMean(count, odds, kept, high);
        }
      }
    }
    if (spec.sign === 1) {
      min += lo;
      max += hi;
    } else {
      min -= hi;
      max -= lo;
    }
    mean = mean === null || avg === null ? null : mean + spec.sign * avg;
  }
  return { min, max, mean };
}
