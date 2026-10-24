import type { Box } from "../board/viewport";

/** Pixel della memoria per pixel del mondo: abbastanza per ricordare stanze e corridoi. */
const SCALE = 0.25;
const MARGIN = 2048;
const MAX_SIDE = 8192;
const SAVE_DELAY_MS = 3000;

interface Saved {
  originX: number;
  originY: number;
  data: string;
}

/**
 * Zone già viste da un giocatore, in un canvas a bassa risoluzione che cresce con la mappa.
 * Si salva nel browser (localStorage), una memoria per stanza e profilo.
 */
export class ExploredMap {
  canvas: HTMLCanvasElement | null = null;
  originX = 0;
  originY = 0;
  version = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly storageKey: string,
    private readonly onChange: () => void,
  ) {}

  get box(): Box | null {
    if (!this.canvas) return null;
    return {
      x: this.originX,
      y: this.originY,
      width: this.canvas.width / SCALE,
      height: this.canvas.height / SCALE,
    };
  }

  load() {
    let saved: Saved | null = null;
    try {
      const raw = localStorage.getItem(this.storageKey);
      saved = raw ? (JSON.parse(raw) as Saved) : null;
    } catch {
      saved = null;
    }
    if (!saved) return;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      // Se nel frattempo si è già esplorato qualcosa, lo si unisce alla memoria salvata.
      const previous = this.canvas;
      const previousOrigin = { x: this.originX, y: this.originY };
      this.canvas = canvas;
      this.originX = saved.originX;
      this.originY = saved.originY;
      if (previous) {
        const box = {
          x: previousOrigin.x,
          y: previousOrigin.y,
          width: previous.width / SCALE,
          height: previous.height / SCALE,
        };
        this.ensure(box);
        this.context().drawImage(
          previous,
          (previousOrigin.x - this.originX) * SCALE,
          (previousOrigin.y - this.originY) * SCALE,
        );
      }
      this.version++;
      this.onChange();
    };
    image.src = saved.data;
  }

  private context(): CanvasRenderingContext2D {
    return (this.canvas as HTMLCanvasElement).getContext("2d") as CanvasRenderingContext2D;
  }

  /** Allarga il canvas fino a contenere `box` (con margine), conservando quanto già esplorato. */
  private ensure(box: Box) {
    const current = this.box;
    if (
      current &&
      box.x >= current.x &&
      box.y >= current.y &&
      box.x + box.width <= current.x + current.width &&
      box.y + box.height <= current.y + current.height
    ) {
      return;
    }
    const x = Math.min(box.x, current?.x ?? box.x) - MARGIN;
    const y = Math.min(box.y, current?.y ?? box.y) - MARGIN;
    const right =
      Math.max(box.x + box.width, current ? current.x + current.width : -Infinity) + MARGIN;
    const bottom =
      Math.max(box.y + box.height, current ? current.y + current.height : -Infinity) + MARGIN;
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(MAX_SIDE, Math.ceil((right - x) * SCALE));
    canvas.height = Math.min(MAX_SIDE, Math.ceil((bottom - y) * SCALE));
    if (this.canvas) {
      canvas
        .getContext("2d")
        ?.drawImage(this.canvas, (this.originX - x) * SCALE, (this.originY - y) * SCALE);
    }
    this.canvas = canvas;
    this.originX = x;
    this.originY = y;
  }

  /** Aggiunge alla memoria ciò che `draw` disegna (in coordinate del mondo) dentro `box`. */
  paint(box: Box, draw: (ctx: CanvasRenderingContext2D) => void) {
    this.ensure(box);
    const ctx = this.context();
    ctx.save();
    ctx.setTransform(SCALE, 0, 0, SCALE, -this.originX * SCALE, -this.originY * SCALE);
    draw(ctx);
    ctx.restore();
    this.version++;
    this.scheduleSave();
    this.onChange();
  }

  clear() {
    this.canvas = null;
    this.version++;
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // Memoria non disponibile: basta averla svuotata qui.
    }
    this.onChange();
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (!this.canvas) return;
      try {
        const saved: Saved = {
          originX: this.originX,
          originY: this.originY,
          data: this.canvas.toDataURL("image/png"),
        };
        localStorage.setItem(this.storageKey, JSON.stringify(saved));
      } catch {
        // Spazio esaurito o accesso negato: la memoria resta solo per questa sessione.
      }
    }, SAVE_DELAY_MS);
  }

  dispose() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
  }
}
