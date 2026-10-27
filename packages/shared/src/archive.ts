import { z } from "zod";

/**
 * Archivio di una stanza (`.scryboard`): uno zip con `manifest.json`, lo stato Yjs dei documenti
 * di ogni scena (`scenes/<n>/public.ydoc` e `gm.ydoc`) e le immagini usate (`assets/<id>`).
 * Non contiene i token, i giocatori né i messaggi privati: importandolo si ottiene una stanza
 * nuova, con nuovi link.
 */
export const ARCHIVE_FORMAT = "scryboard-room";
export const ARCHIVE_VERSION = 1;
export const ARCHIVE_EXTENSION = ".scryboard";
/** Dimensione massima dell'archivio compresso (in lettura e in scrittura). */
export const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
export const MAX_ARCHIVE_SCENES = 30;

export const archiveManifestSchema = z.object({
  format: z.literal(ARCHIVE_FORMAT),
  version: z.literal(ARCHIVE_VERSION),
  name: z.string().trim().min(1).max(80),
  exportedAt: z.iso.datetime(),
  /** Posizione, nell'elenco, della scena dove stavano i giocatori. */
  activeScene: z.number().int().min(0),
  scenes: z
    .array(z.object({ name: z.string().trim().min(1).max(40) }))
    .min(1)
    .max(MAX_ARCHIVE_SCENES),
});
export type ArchiveManifest = z.infer<typeof archiveManifestSchema>;

export const archiveScenePath = (index: number, scope: "public" | "gm") =>
  `scenes/${index}/${scope}.ydoc`;
export const archiveAssetPath = (assetId: string) => `assets/${assetId}`;
