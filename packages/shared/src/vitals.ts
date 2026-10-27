import { z } from "zod";

/**
 * Punti ferita di un token: contatori generici, senza regole (a 0 il token resta dov'è). `value`
 * può scendere sotto zero, come in molti sistemi; i temporanei si consumano per primi.
 */
export const hitPointsSchema = z.object({
  value: z.number().int().min(-9999).max(9999),
  max: z.number().int().min(1).max(9999),
  temp: z.number().int().min(0).max(9999),
});
export type HitPoints = z.infer<typeof hitPointsSchema>;

/**
 * Chi vede i punti ferita: «all» tutti, con i numeri; «band» i giocatori solo la fascia; «gm»
 * solo il GM. Per «band» e «gm» i numeri stanno nel documento del GM (vedi `VITALS_MAP`).
 */
export const HP_VISIBILITIES = ["all", "band", "gm"] as const;
export type HpVisibility = (typeof HP_VISIBILITIES)[number];

/** Fascia approssimativa dei punti ferita, l'unica cosa che i giocatori vedono dei PF segreti. */
export const HP_BANDS = ["healthy", "wounded", "bloodied", "down"] as const;
export type HpBand = (typeof HP_BANDS)[number];

/** Nome della Y.Map, nel documento del GM, con i punti ferita segreti dei token (per id). */
export const VITALS_MAP = "vitals";

/** Illeso a PF pieni, ferito sopra metà, malconcio fino a metà, a terra a 0 o meno. */
export function hpBandOf(hp: HitPoints): HpBand {
  if (hp.value <= 0) return "down";
  if (hp.value >= hp.max) return "healthy";
  return hp.value * 2 > hp.max ? "wounded" : "bloodied";
}

/** Punti ferita segreti: i numeri non stanno sul token del documento pubblico. */
export function isHpSecret(visibility: HpVisibility | undefined): boolean {
  return visibility === "band" || visibility === "gm";
}

/**
 * Applica un danno (delta negativo) o una cura (positivo): il danno consuma prima i temporanei,
 * la cura non supera il massimo né tocca i temporanei. I limiti dello schema restano rispettati.
 */
export function applyDamage(hp: HitPoints, delta: number): HitPoints {
  const amount = Math.trunc(delta);
  if (amount >= 0) {
    return { ...hp, value: Math.max(hp.value, Math.min(hp.max, hp.value + amount)) };
  }
  const absorbed = Math.min(hp.temp, -amount);
  return {
    ...hp,
    temp: hp.temp - absorbed,
    value: Math.max(-9999, hp.value + amount + absorbed),
  };
}

/** «-7» è un danno, «+5» una cura; un numero senza segno è un danno. null se non si capisce. */
export function parseDamage(text: string): number | null {
  const match = /^\s*([+-]?)\s*(\d{1,5})\s*$/.exec(text);
  if (!match) return null;
  const amount = Number(match[2]);
  return match[1] === "+" ? amount : -amount;
}

/**
 * Condizioni comuni a molti sistemi; le etichette stanno nei cataloghi di traduzione (gruppo
 * «conditions»), le icone nel web.
 */
export const CONDITIONS = [
  { id: "blinded", label: "Accecato", color: "#6f6e77" },
  { id: "charmed", label: "Affascinato", color: "#d6409f" },
  { id: "deafened", label: "Assordato", color: "#8e8c99" },
  { id: "frightened", label: "Spaventato", color: "#8e4ec6" },
  { id: "grappled", label: "Afferrato", color: "#ad7f58" },
  { id: "incapacitated", label: "Incapacitato", color: "#f76b15" },
  { id: "invisible", label: "Invisibile", color: "#70b8ff" },
  { id: "paralyzed", label: "Paralizzato", color: "#ffc53d" },
  { id: "petrified", label: "Pietrificato", color: "#8b8d98" },
  { id: "poisoned", label: "Avvelenato", color: "#46a758" },
  { id: "prone", label: "Prono", color: "#a18072" },
  { id: "restrained", label: "Trattenuto", color: "#c2a499" },
  { id: "stunned", label: "Stordito", color: "#ffe629" },
  { id: "unconscious", label: "Privo di sensi", color: "#e5484d" },
  { id: "concentrating", label: "Concentrato", color: "#0090ff" },
  { id: "marked", label: "Segnato", color: "#12a594" },
] as const;
export type ConditionId = (typeof CONDITIONS)[number]["id"];
export const CONDITION_IDS = CONDITIONS.map((c) => c.id) as [ConditionId, ...ConditionId[]];

/** Condizioni personalizzate per token («Benedetto», «Marchio del cacciatore»), oltre al catalogo. */
export const MAX_CUSTOM_CONDITIONS = 8;
export const MAX_CONDITION_LABEL = 24;

/** Durata residua in round: scende quando inizia il turno del token e a zero la condizione sparisce. */
const rounds = z.number().int().min(1).max(999).optional();

const catalogConditionSchema = z.object({ id: z.enum(CONDITION_IDS), rounds }).strict();

const customConditionSchema = z
  .object({
    id: z.literal("custom"),
    label: z.string().trim().min(1).max(MAX_CONDITION_LABEL),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    rounds,
  })
  .strict();

/** Una condizione sul token: dal catalogo o personalizzata, con una durata facoltativa. */
export const tokenConditionSchema = z.union([catalogConditionSchema, customConditionSchema]);
export type TokenCondition = z.infer<typeof tokenConditionSchema>;
export type CustomCondition = z.infer<typeof customConditionSchema>;

/** Identifica una condizione sul token: l'id del catalogo, o l'etichetta per le personalizzate. */
export function conditionKey(condition: TokenCondition): string {
  return condition.id === "custom" ? `custom:${condition.label.toLowerCase()}` : condition.id;
}

export const tokenConditionsSchema = z
  .array(tokenConditionSchema)
  .max(CONDITIONS.length + MAX_CUSTOM_CONDITIONS)
  .refine(
    (list) => new Set(list.map(conditionKey)).size === list.length,
    "Una condizione compare una volta sola",
  )
  .refine(
    (list) => list.filter((c) => c.id === "custom").length <= MAX_CUSTOM_CONDITIONS,
    "Troppe condizioni personalizzate",
  );

/** Prima quelle del catalogo, nel suo ordine, poi le personalizzate nell'ordine in cui sono state aggiunte. */
function sortConditions(list: TokenCondition[]): TokenCondition[] {
  const rank = (c: TokenCondition) =>
    c.id === "custom" ? CONDITION_IDS.length : CONDITION_IDS.indexOf(c.id);
  return list
    .map((condition, index) => ({ condition, index }))
    .sort((a, b) => rank(a.condition) - rank(b.condition) || a.index - b.index)
    .map(({ condition }) => condition);
}

/** Accende o spegne una condizione del catalogo; accendendola di nuovo non cambia la durata. */
export function toggleCondition(
  list: readonly TokenCondition[] | undefined,
  id: ConditionId,
  on: boolean,
): TokenCondition[] {
  const current = list ?? [];
  if (on && current.some((c) => c.id === id)) return [...current];
  const rest = current.filter((c) => c.id !== id);
  return sortConditions(on ? [...rest, { id }] : rest);
}

/**
 * Aggiunge una condizione personalizzata; restituisce null se l'etichetta è vuota, troppo lunga,
 * già presente o se le personalizzate sono già al massimo.
 */
export function addCustomCondition(
  list: readonly TokenCondition[] | undefined,
  label: string,
  color: string,
): TokenCondition[] | null {
  const next = [...(list ?? []), { id: "custom" as const, label: label.trim(), color }];
  const parsed = tokenConditionsSchema.safeParse(next);
  return parsed.success ? sortConditions(parsed.data) : null;
}

/** Toglie la condizione con quella chiave (vedi `conditionKey`). */
export function removeCondition(
  list: readonly TokenCondition[] | undefined,
  key: string,
): TokenCondition[] {
  return (list ?? []).filter((c) => conditionKey(c) !== key);
}

/** Imposta o toglie (null) la durata in round della condizione con quella chiave. */
export function setConditionRounds(
  list: readonly TokenCondition[] | undefined,
  key: string,
  value: number | null,
): TokenCondition[] {
  return (list ?? []).map((c) => {
    if (conditionKey(c) !== key) return c;
    const { rounds: _, ...rest } = c;
    return value === null ? rest : { ...rest, rounds: value };
  });
}

/**
 * Inizio del turno del token: le durate scendono di uno e le condizioni a zero spariscono.
 * Restituisce l'elenco aggiornato e quelle finite.
 */
export function tickConditions(list: readonly TokenCondition[] | undefined): {
  next: TokenCondition[];
  expired: TokenCondition[];
} {
  const next: TokenCondition[] = [];
  const expired: TokenCondition[] = [];
  for (const condition of list ?? []) {
    if (condition.rounds === undefined) next.push(condition);
    else if (condition.rounds <= 1) expired.push(condition);
    else next.push({ ...condition, rounds: condition.rounds - 1 });
  }
  return { next, expired };
}
