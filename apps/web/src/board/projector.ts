import type { TokenItem } from "@scryboard/shared";

/** Spazio attorno al gruppo inquadrato dallo schermo condiviso, in caselle. */
const PROJECTOR_MARGIN_CELLS = 3;

/** Ingrandimento massimo dello schermo condiviso: con un solo token non si arriva al primo piano. */
export const PROJECTOR_MAX_SCALE = 1.5;

/** Attesa dopo l'ultimo movimento del gruppo prima di spostare l'inquadratura. */
export const PROJECTOR_FOLLOW_DELAY_MS = 250;

/**
 * Riquadro da inquadrare sullo schermo condiviso: tutti i token del gruppo, con qualche casella
 * di margine, arrotondato al pixel così un ricalcolo identico non sposta la vista.
 */
export function partyBounds(
  tokens: readonly TokenItem[],
  cellSize: number,
): { x: number; y: number; width: number; height: number } | null {
  if (tokens.length === 0) return null;
  const margin = PROJECTOR_MARGIN_CELLS * cellSize;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const token of tokens) {
    const r = (token.size * cellSize) / 2;
    left = Math.min(left, token.x - r);
    top = Math.min(top, token.y - r);
    right = Math.max(right, token.x + r);
    bottom = Math.max(bottom, token.y + r);
  }
  const x = Math.round(left - margin);
  const y = Math.round(top - margin);
  return { x, y, width: Math.round(right + margin) - x, height: Math.round(bottom + margin) - y };
}
