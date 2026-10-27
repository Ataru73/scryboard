import type { ConditionId } from "@scryboard/shared";

/**
 * Icone delle condizioni: tracciati SVG su una griglia 24×24, da disegnare a tratto. Le usa sia il
 * pannello HTML sia il token in Konva. `dash` tratteggia l'icona (l'occhio di «invisibile»).
 */
export const CONDITION_ICONS: Record<ConditionId, { path: string; dash?: boolean }> = {
  blinded: {
    path: "M9.9 9.9a3 3 0 1 0 4.2 4.2M10.7 5.1A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13 13 0 0 1-1.7 2.7M6.6 6.6A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20",
  },
  charmed: {
    path: "M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z",
  },
  deafened: {
    path: "M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4M2 2l20 20",
  },
  frightened: {
    path: "M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z",
  },
  grappled: {
    path: "M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15",
  },
  incapacitated: { path: "M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20M4.9 4.9l14.2 14.2" },
  invisible: {
    path: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6",
    dash: true,
  },
  paralyzed: { path: "M13 2 3 14h9l-1 8 10-12h-9l1-8z" },
  petrified: { path: "m8 3 4 8 5-5 5 15H2L8 3z" },
  poisoned: {
    path: "M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z",
  },
  prone: { path: "M12 3v14M5 10l7 7 7-7M19 21H5" },
  restrained: { path: "M5 11h14v10H5zM7 11V7a5 5 0 0 1 10 0v4" },
  stunned: {
    path: "M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2L7 14.1 2 9.3l6.9-1L12 2z",
  },
  unconscious: { path: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" },
  concentrating: {
    path: "M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20M12 6a6 6 0 1 0 0 12a6 6 0 1 0 0-12M12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4",
  },
  marked: { path: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" },
};
