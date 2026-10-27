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

/** Una condizione sul token; `rounds` (facoltativo) è la durata residua in round. */
export const tokenConditionSchema = z.object({
  id: z.enum(CONDITION_IDS),
  rounds: z.number().int().min(1).max(999).optional(),
});
export type TokenCondition = z.infer<typeof tokenConditionSchema>;

export const tokenConditionsSchema = z
  .array(tokenConditionSchema)
  .max(CONDITIONS.length)
  .refine(
    (list) => new Set(list.map((c) => c.id)).size === list.length,
    "Una condizione compare una volta sola",
  );

/** Accende o spegne una condizione, tenendo l'ordine del catalogo. */
export function toggleCondition(
  list: readonly TokenCondition[] | undefined,
  id: ConditionId,
  on: boolean,
): TokenCondition[] {
  const rest = (list ?? []).filter((c) => c.id !== id);
  const next = on ? [...rest, { id }] : rest;
  return next.sort((a, b) => CONDITION_IDS.indexOf(a.id) - CONDITION_IDS.indexOf(b.id));
}
