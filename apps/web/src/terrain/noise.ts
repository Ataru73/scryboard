/** Generatore pseudo-casuale deterministico (mulberry32): stessa sequenza a ogni avvio. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash stabile di una stringa (FNV-1a), per ricavare un seme da un id. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const fade = (t: number) => t * t * (3 - 2 * t);
const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * Rumore a valori in [0, 1], periodico: noise(x + period, y) = noise(x, y + period) = noise(x, y).
 * La periodicità rende le texture ripetibili senza cuciture.
 */
export function tileableNoise(seed: number, period: number): (x: number, y: number) => number {
  const random = seededRandom(seed);
  const lattice = new Float32Array(period * period);
  for (let i = 0; i < lattice.length; i++) lattice[i] = random();
  const at = (ix: number, iy: number) =>
    lattice[mod(iy, period) * period + mod(ix, period)] as number;
  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = fade(x - x0);
    const ty = fade(y - y0);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    return top + (bottom - top) * ty;
  };
}

/**
 * Somma di più ottave di rumore (fBm), normalizzata in [0, 1] e periodica su `period`: ogni
 * ottava raddoppia frequenza e periodo, così la ripetizione resta allineata.
 */
export function tileableFbm(
  seed: number,
  period: number,
  octaves: number,
): (x: number, y: number) => number {
  const layers = Array.from({ length: octaves }, (_, i) =>
    tileableNoise(seed + i * 1013, period * 2 ** i),
  );
  let total = 0;
  for (let i = 0; i < octaves; i++) total += 0.5 ** i;
  return (x, y) => {
    let sum = 0;
    for (let i = 0; i < octaves; i++) {
      sum += (layers[i] as (x: number, y: number) => number)(x * 2 ** i, y * 2 ** i) * 0.5 ** i;
    }
    return sum / total;
  };
}

/** Rumore a una dimensione in [-1, 1], per irregolarità lungo un tratto. */
export function noise1d(seed: number): (t: number) => number {
  const random = seededRandom(seed);
  const values = Array.from({ length: 256 }, () => random() * 2 - 1);
  return (t) => {
    const i = Math.floor(t);
    const a = values[mod(i, 256)] as number;
    const b = values[mod(i + 1, 256)] as number;
    return a + (b - a) * fade(t - i);
  };
}
