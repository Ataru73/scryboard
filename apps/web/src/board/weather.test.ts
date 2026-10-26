import { describe, expect, it } from "vitest";
import { createParticles, particleCount, step } from "./weather";

/** Generatore deterministico per i test. */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe("weather", () => {
  it("scales the particles with the screen, within a limit", () => {
    expect(particleCount("none", 1920, 1080)).toBe(0);
    expect(particleCount("rain", 1000, 1000)).toBe(140);
    expect(particleCount("rain", 8000, 8000)).toBe(260);
    expect(particleCount("mist", 10, 10)).toBe(1);
  });

  it("starts everywhere on screen", () => {
    const particles = createParticles("snow", 800, 600, seeded());
    expect(particles.length).toBe(particleCount("snow", 800, 600));
    expect(particles.every((p) => p.x >= 0 && p.x <= 800 && p.y >= 0 && p.y <= 600)).toBe(true);
  });

  it("moves rain down and embers up, respawning what leaves the screen", () => {
    const random = seeded(7);
    const rain = createParticles("rain", 800, 600, random);
    const y0 = rain.map((p) => p.y);
    step(rain, "rain", 0.01, 800, 600, random);
    expect(rain.every((p, i) => p.y > (y0[i] as number))).toBe(true);
    // Dopo qualche secondo tutte le gocce sono rinate in alto e ricadute: restano sullo schermo.
    for (let i = 0; i < 300; i++) step(rain, "rain", 1 / 60, 800, 600, random);
    expect(rain.every((p) => p.y < 600 + p.size + 30)).toBe(true);

    const embers = createParticles("embers", 800, 600, random);
    const e0 = embers.map((p) => p.y);
    step(embers, "embers", 0.01, 800, 600, random);
    expect(embers.every((p, i) => p.y < (e0[i] as number))).toBe(true);
  });
});
