import type { Weather } from "@scryboard/shared";
import { useEffect, useRef } from "react";
import { createParticles, draw, step } from "./weather";

/**
 * Meteo della scena su un canvas sopra la lavagna, che non intercetta il puntatore. Con «riduci
 * movimento» attivo nel sistema si disegna un solo fotogramma, fermo.
 */
export function WeatherOverlay({
  weather,
  width,
  height,
}: {
  weather: Weather;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || weather === "none" || width === 0 || height === 0) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const particles = createParticles(weather, width, height);
    const frame = () => {
      ctx.clearRect(0, 0, width, height);
      draw(ctx, particles, weather);
    };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      frame();
      return;
    }
    let last = performance.now();
    let handle = requestAnimationFrame(function tick(now) {
      // Dopo una pausa (scheda in background) non si recupera tutto il tempo perso.
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(particles, weather, dt, width, height);
      frame();
      handle = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(handle);
  }, [weather, width, height]);

  if (weather === "none") return null;
  return (
    <canvas
      ref={canvasRef}
      className="weather-overlay"
      style={{ width, height }}
      data-weather={weather}
    />
  );
}
