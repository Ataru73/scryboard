import type { Message } from "@scryboard/shared";
import { describe, expect, it } from "vitest";
import { groupConversations } from "./conversations";

const A = "a1a1a1a1";
const B = "b2b2b2b2";
let n = 0;
const msg = (from: string, to: string, text: string): Message => ({
  id: `m${++n}`,
  from,
  fromName: from === "gm" ? "Master" : from === A ? "Arwen" : "Bilbo",
  to,
  toName: to === "gm" ? "GM" : to === A ? "Arwen" : "Bilbo",
  text,
  at: new Date(Date.UTC(2030, 0, 1, 0, 0, n)).toISOString(),
});

describe("groupConversations", () => {
  const messages = [
    msg(A, B, "ciao Bilbo"),
    msg("gm", A, "senti un rumore"),
    msg(B, A, "ciao Arwen"),
  ];

  it("groups a player's messages by the other person, newest first", () => {
    const list = groupConversations(messages, A);
    expect(list.map((c) => [c.key, c.title, c.messages.length])).toEqual([
      [B, "Bilbo", 2],
      ["gm", "Master (GM)", 1],
    ]);
    expect(list.every((c) => c.partner !== null)).toBe(true);
  });

  it("shows the GM player-to-player threads as read-only pairs", () => {
    const list = groupConversations(messages, "gm");
    const pair = list.find((c) => c.partner === null);
    expect(pair?.title).toBe("Arwen ↔ Bilbo");
    expect(pair?.messages).toHaveLength(2);
    expect(list.find((c) => c.key === A)?.title).toBe("Arwen");
  });

  it("counts unread messages from others since the last read", () => {
    const list = groupConversations(messages, A, { [B]: messages[0]?.at ?? "" });
    expect(list.find((c) => c.key === B)?.unread).toBe(1);
    expect(list.find((c) => c.key === "gm")?.unread).toBe(1);
    // I propri messaggi non contano come non letti.
    expect(groupConversations([msg(A, "gm", "x")], A)[0]?.unread).toBe(0);
  });

  it("prefers the current names of connected players", () => {
    const list = groupConversations([msg(A, B, "x")], A, {}, new Map([[B, "Bilbo Baggins"]]));
    expect(list[0]?.title).toBe("Bilbo Baggins");
  });
});
