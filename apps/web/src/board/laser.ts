/** Quanto resta visibile un punto della scia del puntatore. */
export const LASER_TRAIL_MS = 1200;
/** Punti più recenti inviati agli altri: bastano a coprire l'intervallo tra due invii. */
export const LASER_SENT_POINTS = 48;

/**
 * Puntatore con scia, nell'awareness (campo `laser`): gli ultimi punti del tratto in corso, in
 * coordinate del mondo. `start` è il numero d'ordine del primo, così chi riceve aggiunge solo i
 * punti nuovi anche se un invio va perso o ne ripete alcuni.
 */
export interface LaserState {
  id: string;
  start: number;
  points: number[];
}

/** Lo stato arriva da altri client: si accetta solo se ha la forma giusta e dimensioni sensate. */
export function parseLaserState(value: unknown): LaserState | null {
  if (!value || typeof value !== "object") return null;
  const { id, start, points } = value as Record<string, unknown>;
  if (typeof id !== "string" || id.length > 64) return null;
  if (typeof start !== "number" || !Number.isInteger(start) || start < 0) return null;
  if (!Array.isArray(points) || points.length % 2 !== 0) return null;
  if (points.length > LASER_SENT_POINTS * 2) return null;
  if (!points.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  return { id, start, points };
}

/** Tratto che si sta tracciando: tiene il conto dei punti e invia solo gli ultimi. */
export function addLaserPoint(state: LaserState, x: number, y: number): LaserState {
  const points = [...state.points, x, y];
  const extra = points.length / 2 - LASER_SENT_POINTS;
  return extra > 0
    ? { id: state.id, start: state.start + extra, points: points.slice(extra * 2) }
    : { ...state, points };
}

interface TrailPoint {
  x: number;
  y: number;
  /** Quando è arrivato, nell'orologio di chi guarda. */
  at: number;
  /** Tratto a cui appartiene: tra due tratti la scia non si unisce. */
  stroke: string;
}

/**
 * Scia di un utente vista da chi guarda: ogni punto svanisce in base a quando è arrivato qui, così
 * non conta l'orologio di chi lo ha tracciato.
 */
export class LaserTrail {
  readonly points: TrailPoint[] = [];
  private stroke: string | null = null;
  private next = 0;

  /** Aggiunge i punti mai visti dell'ultimo stato ricevuto. */
  ingest(state: LaserState | null, now: number) {
    if (!state) return;
    if (state.id !== this.stroke) {
      this.stroke = state.id;
      this.next = state.start;
    }
    const count = state.points.length / 2;
    for (let i = Math.max(0, this.next - state.start); i < count; i++) {
      this.points.push({
        x: state.points[i * 2] as number,
        y: state.points[i * 2 + 1] as number,
        at: now,
        stroke: state.id,
      });
    }
    this.next = Math.max(this.next, state.start + count);
  }

  /** Toglie i punti svaniti; restituisce false se non resta niente da disegnare. */
  prune(now: number): boolean {
    let old = 0;
    while (old < this.points.length && now - (this.points[old] as TrailPoint).at > LASER_TRAIL_MS) {
      old++;
    }
    if (old > 0) this.points.splice(0, old);
    return this.points.length > 0;
  }
}
