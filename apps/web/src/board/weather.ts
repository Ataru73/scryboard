import type { Weather } from "@scryboard/shared";

/**
 * Meteo animato sopra la lavagna, in coordinate dello schermo: poche decine di particelle
 * vettoriali, nessuna immagine. Le funzioni sono pure (a parte il disegno) per poterle provare.
 */
export interface Particle {
  x: number;
  y: number;
  /** Velocità in pixel al secondo. */
  vx: number;
  vy: number;
  /** Lunghezza della goccia, raggio del fiocco, della brace o del banco di nebbia. */
  size: number;
  /** Fase dell'oscillazione (neve, braci) o dello sfarfallio. */
  phase: number;
}

type Random = () => number;

/** Particelle per ogni milione di pixel dello schermo, e al massimo. */
const DENSITY: Record<Exclude<Weather, "none">, { perMegapixel: number; max: number }> = {
  rain: { perMegapixel: 140, max: 260 },
  snow: { perMegapixel: 110, max: 200 },
  embers: { perMegapixel: 60, max: 120 },
  mist: { perMegapixel: 5, max: 9 },
};

export function particleCount(weather: Weather, width: number, height: number): number {
  if (weather === "none") return 0;
  const { perMegapixel, max } = DENSITY[weather];
  return Math.min(max, Math.max(1, Math.round(((width * height) / 1e6) * perMegapixel)));
}

/**
 * Una particella nuova. `anywhere` la mette in un punto qualsiasi (all'avvio); altrimenti entra
 * dal bordo da cui arriva il movimento.
 */
export function spawn(
  weather: Exclude<Weather, "none">,
  width: number,
  height: number,
  random: Random,
  anywhere: boolean,
): Particle {
  const phase = random() * Math.PI * 2;
  switch (weather) {
    case "rain": {
      const size = 14 + random() * 12;
      return {
        // Cade un po' di traverso: entra anche da sinistra.
        x: random() * (width + 200) - 200,
        y: anywhere ? random() * height : -size - random() * 40,
        vx: 140,
        vy: 900 + random() * 400,
        size,
        phase,
      };
    }
    case "snow":
      return {
        x: random() * width,
        y: anywhere ? random() * height : -10,
        vx: 0,
        vy: 30 + random() * 50,
        size: 1.5 + random() * 2.5,
        phase,
      };
    case "embers":
      return {
        x: random() * width,
        y: anywhere ? random() * height : height + 10,
        vx: random() * 30 - 15,
        vy: -(40 + random() * 70),
        size: 1 + random() * 2,
        phase,
      };
    case "mist": {
      const size = 160 + random() * 220;
      return {
        x: anywhere ? random() * width : -size,
        y: random() * height,
        vx: 8 + random() * 18,
        vy: 0,
        size,
        phase,
      };
    }
  }
}

export function createParticles(
  weather: Weather,
  width: number,
  height: number,
  random: Random = Math.random,
): Particle[] {
  if (weather === "none") return [];
  return Array.from({ length: particleCount(weather, width, height) }, () =>
    spawn(weather, width, height, random, true),
  );
}

/** Avanza di `dt` secondi; chi esce dallo schermo rinasce dal bordo opposto. */
export function step(
  particles: Particle[],
  weather: Weather,
  dt: number,
  width: number,
  height: number,
  random: Random = Math.random,
): void {
  if (weather === "none") return;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i] as Particle;
    p.phase += dt * (weather === "embers" ? 3 : 1.2);
    // Neve e braci ondeggiano mentre cadono o salgono.
    const sway =
      weather === "snow"
        ? Math.sin(p.phase) * 20
        : weather === "embers"
          ? Math.sin(p.phase) * 15
          : 0;
    p.x += (p.vx + sway) * dt;
    p.y += p.vy * dt;
    const out =
      weather === "embers"
        ? p.y < -10
        : weather === "mist"
          ? p.x - p.size > width
          : p.y - p.size > height || p.x - p.size > width;
    if (out) particles[i] = spawn(weather, width, height, random, false);
  }
}

/** Disegna le particelle; `ctx` è già pulito. */
export function draw(ctx: CanvasRenderingContext2D, particles: Particle[], weather: Weather) {
  switch (weather) {
    case "rain":
      ctx.strokeStyle = "rgba(190, 210, 235, 0.45)";
      ctx.lineWidth = 1.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const p of particles) {
        const k = p.size / Math.hypot(p.vx, p.vy);
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * k, p.y - p.vy * k);
      }
      ctx.stroke();
      return;
    case "snow":
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.beginPath();
      for (const p of particles) {
        ctx.moveTo(p.x + p.size, p.y);
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      }
      ctx.fill();
      return;
    case "embers":
      for (const p of particles) {
        const glow = 0.55 + 0.45 * Math.sin(p.phase * 2);
        ctx.fillStyle = `rgba(255, ${Math.round(120 + 60 * glow)}, 60, ${0.35 + 0.5 * glow})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    case "mist":
      for (const p of particles) {
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        gradient.addColorStop(0, "rgba(225, 230, 240, 0.22)");
        gradient.addColorStop(1, "rgba(225, 230, 240, 0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      }
      return;
    case "none":
      return;
  }
}
