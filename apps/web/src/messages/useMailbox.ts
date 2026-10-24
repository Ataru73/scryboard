import type { HocuspocusProvider } from "@hocuspocus/provider";
import { MESSAGES_ARRAY, type Message, messageSchema } from "@scryboard/shared";
import { useEffect, useState } from "react";

/** Messaggi della propria casella di posta, aggiornati in tempo reale. */
export function useMailbox(provider: HocuspocusProvider | null): Message[] {
  const [messages, setMessages] = useState<Message[]>([]);
  useEffect(() => {
    if (!provider) return;
    const array = provider.document.getArray<unknown>(MESSAGES_ARRAY);
    const update = () =>
      setMessages(
        array.toArray().flatMap((value) => {
          const parsed = messageSchema.safeParse(value);
          return parsed.success ? [parsed.data] : [];
        }),
      );
    update();
    array.observe(update);
    return () => array.unobserve(update);
  }, [provider]);
  return messages;
}

/** Fino a quando ogni conversazione è stata letta, ricordato nel browser. */
export function useLastRead(storageKey: string) {
  const [lastRead, setLastRead] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string, string>;
    } catch {
      return {};
    }
  });
  const markRead = (key: string, at: string) =>
    setLastRead((current) => {
      if ((current[key] ?? "") >= at) return current;
      const next = { ...current, [key]: at };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Memoria non disponibile: vale per questa sessione.
      }
      return next;
    });
  return { lastRead, markRead };
}
