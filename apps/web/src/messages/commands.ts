/**
 * Comandi dei dadi in una conversazione, come negli altri tavoli virtuali: «/r 2d6+1» o
 * «/roll 2d6+1» tirano per tutto il tavolo, «/gr» o «/gmroll» tirano di nascosto (solo il GM).
 * null se il testo è un messaggio normale.
 */
export function parseRollCommand(
  text: string,
  isGm: boolean,
): { formula: string; hidden: boolean } | null {
  const match = /^\/(r|roll|gr|gmroll)\s+(.+)$/i.exec(text.trim());
  if (!match) return null;
  const hidden = /^g/i.test(match[1] as string);
  // Un giocatore non tira di nascosto: il suo «/gr» resta un messaggio, non diventa pubblico.
  if (hidden && !isGm) return null;
  return { formula: (match[2] as string).trim(), hidden };
}

/** «/me sguaina la spada»: un'azione in terza persona. Il testo dopo /me, o null. */
export function emoteText(text: string): string | null {
  const match = /^\/me\s+(\S[\s\S]*)$/i.exec(text.trim());
  return match ? (match[1] as string) : null;
}

/** Come si legge un messaggio in breve: le azioni con il nome di chi le fa. */
export function messagePreview(message: { text: string; fromName: string }): string {
  const emote = emoteText(message.text);
  return emote === null ? message.text : `${message.fromName} ${emote}`;
}
