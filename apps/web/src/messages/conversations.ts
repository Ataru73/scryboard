import { GM_MAILBOX, type Message } from "@scryboard/shared";
import i18n from "../i18n";

export interface Conversation {
  /** Interlocutore ("gm" o id del profilo); per il GM che legge due giocatori, la coppia "a|b". */
  key: string;
  /** A chi si risponde; null per le conversazioni tra giocatori che il GM legge soltanto. */
  partner: string | null;
  title: string;
  messages: Message[];
  lastAt: string;
  unread: number;
}

/** Nome più recente con cui compare un partecipante. */
function namesById(messages: Message[]): Map<string, string> {
  const names = new Map<string, string>([[GM_MAILBOX, "GM"]]);
  for (const m of messages) {
    if (m.fromName) names.set(m.from, m.from === GM_MAILBOX ? `${m.fromName} (GM)` : m.fromName);
    if (m.toName && m.to !== GM_MAILBOX) names.set(m.to, m.toName);
  }
  return names;
}

/**
 * Raggruppa i messaggi della casella in conversazioni, dalla più recente. `me` è "gm" o l'id del
 * profilo; `lastRead` dice fino a quando ogni conversazione è stata letta.
 */
export function groupConversations(
  messages: Message[],
  me: string,
  lastRead: Record<string, string> = {},
  /** Nomi attuali dei giocatori connessi: hanno la precedenza su quelli salvati nei messaggi. */
  knownNames: ReadonlyMap<string, string> = new Map(),
): Conversation[] {
  const names = namesById(messages);
  for (const [id, name] of knownNames) names.set(id, name);
  const byKey = new Map<string, Conversation>();
  for (const m of [...messages].sort((a, b) => a.at.localeCompare(b.at))) {
    let key: string;
    let partner: string | null;
    let title: string;
    if (m.from === me || m.to === me) {
      partner = m.from === me ? m.to : m.from;
      key = partner;
      title = names.get(partner) ?? i18n.t("social.messages.unknownPlayer");
    } else {
      // Solo il GM vede messaggi che non sono suoi: quelli tra due giocatori.
      const [a, b] = [m.from, m.to].sort() as [string, string];
      key = `${a}|${b}`;
      partner = null;
      title = `${names.get(a) ?? "?"} ↔ ${names.get(b) ?? "?"}`;
    }
    const conversation = byKey.get(key) ?? {
      key,
      partner,
      title,
      messages: [],
      lastAt: m.at,
      unread: 0,
    };
    conversation.messages.push(m);
    conversation.lastAt = m.at;
    conversation.title = title;
    if (m.from !== me && m.at > (lastRead[key] ?? "")) conversation.unread++;
    byKey.set(key, conversation);
  }
  return [...byKey.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
