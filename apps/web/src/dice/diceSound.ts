import { storage } from "../lib/storage";

let audioCtx: AudioContext | null = null;
let impactBuffers: AudioBuffer[] | null = null;

/** Reimposta il contesto (utilizzato nei test di unità). */
export function _resetAudioContextForTests(): void {
  audioCtx = null;
  impactBuffers = null;
}

/** Verifica se l'ambiente supporta Web Audio. */
export function isAudioSupported(): boolean {
  if (typeof window !== "undefined") {
    return Boolean(
      window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext,
    );
  }
  return typeof AudioContext !== "undefined";
}

/** Ottiene o crea il contesto Web Audio singleton. */
export function getAudioContext(): AudioContext | null {
  if (!isAudioSupported()) return null;
  if (!audioCtx) {
    try {
      const AudioCtxClass =
        (typeof window !== "undefined"
          ? window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
          : undefined) || (typeof AudioContext !== "undefined" ? AudioContext : undefined);
      if (!AudioCtxClass) return null;
      audioCtx = new AudioCtxClass();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

/** Sblocca il contesto audio al primo gesto dell'utente (policy autoplay dei browser). */
export function unlockAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

// Sblocco automatico al primo clic o tocco
if (typeof window !== "undefined") {
  const handleInteraction = () => {
    unlockAudioContext();
    window.removeEventListener("pointerdown", handleInteraction);
    window.removeEventListener("keydown", handleInteraction);
  };
  window.addEventListener("pointerdown", handleInteraction, { once: true });
  window.addEventListener("keydown", handleInteraction, { once: true });
}

interface ImpactDef {
  freq: number;
  decay: number;
  click: number;
  thud: number;
}

const IMPACT_DEFS: ImpactDef[] = [
  { freq: 2800, decay: 0.015, click: 0.65, thud: 230 }, // Tocco acrilico chiaro
  { freq: 2200, decay: 0.018, click: 0.55, thud: 200 }, // Risonanza media resina
  { freq: 3300, decay: 0.012, click: 0.7, thud: 260 }, // Collisione tra dadi
  { freq: 1800, decay: 0.022, click: 0.5, thud: 180 }, // Rimbalzo cavo su legno
];

/** Genera i campioni audio sintetici per i singoli impatti dei dadi. */
function createImpactBuffers(ctx: AudioContext): AudioBuffer[] {
  const sampleRate = ctx.sampleRate;
  const numSamples = Math.floor(sampleRate * 0.045);

  return IMPACT_DEFS.map((def) => {
    const buffer = ctx.createBuffer(1, numSamples, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      // Impulso di attacco transiente (rumore bianco con decadimento ultrarapido ~2.2ms)
      const click = (Math.random() * 2 - 1) * Math.exp(-t / 0.0022) * def.click;
      // Risonanza poliedrica principale
      const body1 = Math.sin(2 * Math.PI * def.freq * t) * Math.exp(-t / def.decay);
      // Armonica superiore del materiale
      const body2 =
        0.35 * Math.sin(2 * Math.PI * (def.freq * 1.54) * t) * Math.exp(-t / (def.decay * 0.55));
      // Tono profondo del tavolo/vassoio con pitch drop iniziale
      const thudPitch = def.thud * (1 + 0.6 * Math.exp(-t * 80));
      const thud = 0.4 * Math.sin(2 * Math.PI * thudPitch * t) * Math.exp(-t / 0.018);

      data[i] = (click + body1 * 0.65 + body2 * 0.45 + thud * 0.5) * 0.75;
    }

    return buffer;
  });
}

/**
 * Riproduce un effetto sonoro realistico di lancio e rotolamento dei dadi sul tavolo.
 * @param count Numero di dadi tirati (influenza la pienezza e il numero di rimbalzi).
 */
export function playDiceRollSound(count = 1): void {
  if (storage.getDiceSoundMuted()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  if (!impactBuffers) {
    try {
      impactBuffers = createImpactBuffers(ctx);
    } catch {
      return;
    }
  }

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.7, now);
  masterGain.connect(ctx.destination);

  // Numero di flussi sonori di rimbalzo simultanei (fino a 4 per non saturare)
  const streams = Math.min(Math.max(1, count), 4);
  const totalDuration = 0.95;

  for (let s = 0; s < streams; s++) {
    let t = now + 0.015 + s * 0.03 + Math.random() * 0.02;
    let interval = 0.065 + Math.random() * 0.03;
    let gain = 0.6 / Math.sqrt(streams);

    // Rimbalzi successivi lungo la traiettoria di rotolamento
    while (t < now + 0.7) {
      const presetIdx = Math.floor(Math.random() * impactBuffers.length);
      const buffer = impactBuffers[presetIdx];
      if (buffer) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.setValueAtTime(0.88 + Math.random() * 0.28, t);

        const bounceGain = ctx.createGain();
        bounceGain.gain.setValueAtTime(gain, t);

        source.connect(bounceGain);
        bounceGain.connect(masterGain);
        source.start(t);
      }

      t += interval;
      interval *= 1.18 + Math.random() * 0.1;
      gain *= 0.74;
    }

    // Colpo finale di arresto sul tavolo
    const settleTime = now + 0.72 + s * 0.03 + Math.random() * 0.04;
    if (settleTime < now + totalDuration - 0.05) {
      const buffer = impactBuffers[0];
      if (buffer) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.setValueAtTime(0.95 + Math.random() * 0.15, settleTime);

        const settleGain = ctx.createGain();
        settleGain.gain.setValueAtTime(
          (0.25 + Math.random() * 0.1) / Math.sqrt(streams),
          settleTime,
        );

        source.connect(settleGain);
        settleGain.connect(masterGain);
        source.start(settleTime);
      }
    }
  }

  // Scollega il nodo dopo il termine per liberare risorse
  setTimeout(
    () => {
      try {
        masterGain.disconnect();
      } catch {
        // Ignorato se già disconnesso
      }
    },
    Math.round(totalDuration * 1000) + 150,
  );
}
