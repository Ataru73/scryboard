import type { PathStyleId } from "@scryboard/shared";
import { biomeTexture, pathTexture } from "../terrain/textures";

/** Una fascia del percorso: dal bordo esterno verso il centro. */
export interface PathBand {
  /** Larghezza rispetto a quella del percorso. */
  widthScale: number;
  texture?: () => HTMLCanvasElement;
  color?: string;
  opacity: number;
}

export interface PathLook {
  bands: PathBand[];
  /** Strade con estremità arrotondate; i corsi d'acqua finiscono assottigliati. */
  roundCaps: boolean;
  /** Colore per le anteprime. */
  preview: string;
}

export const PATH_LOOKS: Record<PathStyleId, PathLook> = {
  trail: {
    roundCaps: true,
    preview: "#a3875c",
    bands: [
      { widthScale: 1.3, color: "#6f5838", opacity: 0.35 },
      { widthScale: 1, texture: () => pathTexture("trail"), opacity: 1 },
    ],
  },
  "dirt-road": {
    roundCaps: true,
    preview: "#84693f",
    bands: [
      { widthScale: 1.15, color: "#4f3d26", opacity: 0.7 },
      { widthScale: 1, texture: () => pathTexture("dirt"), opacity: 1 },
    ],
  },
  "paved-road": {
    roundCaps: true,
    preview: "#57514b",
    bands: [
      { widthScale: 1.12, color: "#2f2b28", opacity: 0.85 },
      { widthScale: 1, texture: () => pathTexture("cobble"), opacity: 1 },
    ],
  },
  stream: {
    roundCaps: false,
    preview: "#62a9c7",
    bands: [
      { widthScale: 1.3, color: "#5c4a33", opacity: 0.3 },
      { widthScale: 1, texture: () => biomeTexture("shallow-water"), opacity: 1 },
    ],
  },
  river: {
    roundCaps: false,
    preview: "#1d5079",
    bands: [
      { widthScale: 1.35, texture: () => biomeTexture("mud"), opacity: 0.75 },
      { widthScale: 1.1, texture: () => biomeTexture("shallow-water"), opacity: 1 },
      { widthScale: 0.7, texture: () => biomeTexture("deep-water"), opacity: 1 },
    ],
  },
};
