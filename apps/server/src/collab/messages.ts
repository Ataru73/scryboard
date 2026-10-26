import { randomBytes } from "node:crypto";
import type { Hocuspocus } from "@hocuspocus/server";
import {
  GM_MAILBOX,
  MESSAGES_ARRAY,
  type Message,
  type MessageNote,
  mailDocumentName,
} from "@scryboard/shared";
import type { PlayerService } from "../rooms/players";
import type { ConnectionContext } from "./hocuspocus";

export type Sender =
  | { kind: "gm"; name: string }
  | { kind: "player"; profileId: string; name: string };

export class MessageError extends Error {}

/**
 * Consegna dei messaggi privati: il server scrive il messaggio nella casella del mittente, in
 * quella del destinatario e in quella del GM (che legge tutto). Nessun altro lo riceve.
 */
export class MessageService {
  constructor(
    private readonly collab: Hocuspocus<ConnectionContext>,
    private readonly players: PlayerService,
  ) {}

  async send(
    roomId: string,
    sender: Sender,
    to: string,
    text: string,
    note?: MessageNote,
  ): Promise<Message> {
    const from = sender.kind === "gm" ? GM_MAILBOX : sender.profileId;
    if (from === to) throw new MessageError("Non puoi scrivere a te stesso.");
    if (note && sender.kind !== "gm") throw new MessageError("Solo il GM può inviare note.");
    if (to !== GM_MAILBOX && !this.players.exists(roomId, to)) {
      throw new MessageError("Questo giocatore non è mai entrato nella stanza.");
    }
    if (sender.kind === "player") this.players.rename(roomId, sender.profileId, sender.name);

    const message: Message = {
      id: randomBytes(12).toString("base64url"),
      from,
      fromName: sender.name,
      to,
      // Chi non ha ancora scritto non ha un nome registrato: lo completano i client dalla presenza.
      toName: to === GM_MAILBOX ? "GM" : this.players.name(roomId, to) || "Giocatore",
      text,
      ...(note ? { note } : {}),
      at: new Date().toISOString(),
    };
    const mailboxes = new Set([GM_MAILBOX, from, to]);
    for (const mailbox of mailboxes) {
      const connection = await this.collab.openDirectConnection(mailDocumentName(roomId, mailbox), {
        roomId,
        role: "gm",
      });
      try {
        await connection.transact((doc) => doc.getArray<Message>(MESSAGES_ARRAY).push([message]));
      } finally {
        await connection.disconnect();
      }
    }
    return message;
  }
}
