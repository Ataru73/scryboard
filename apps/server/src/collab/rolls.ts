import { randomBytes, randomInt } from "node:crypto";
import type { Hocuspocus } from "@hocuspocus/server";
import {
  GM_MAILBOX,
  MAX_ROLLS,
  ROLLS_MAP,
  type Roll,
  rollDice,
  roomDocumentName,
} from "@scryboard/shared";
import type { SceneService } from "../rooms/scenes";
import type { ConnectionContext } from "./hocuspocus";
import type { Sender } from "./messages";

/**
 * Tiri di dadi: li fa il server (così nessuno può truccarli dal browser). Un tiro pubblico finisce
 * nel documento pubblico, dove lo vedono tutti; uno nascosto del GM torna solo a chi l'ha chiesto.
 */
export class RollService {
  constructor(
    private readonly collab: Hocuspocus<ConnectionContext>,
    private readonly scenes: SceneService,
  ) {}

  async roll(roomId: string, sender: Sender, formula: string, hidden: boolean): Promise<Roll> {
    // Lancia DiceError se la formula non è valida: il chiamante risponde 400.
    const result = rollDice(formula, (sides) => randomInt(1, sides + 1));
    const roll: Roll = {
      id: randomBytes(12).toString("base64url"),
      from: sender.kind === "gm" ? GM_MAILBOX : sender.profileId,
      name: sender.name,
      ...result,
      at: new Date().toISOString(),
    };
    if (hidden) return roll;
    const connection = await this.collab.openDirectConnection(
      roomDocumentName(roomId, "public", this.scenes.activeId(roomId)),
      {
        roomId,
        role: "gm",
      },
    );
    try {
      await connection.transact((doc) => {
        const rolls = doc.getMap<Roll>(ROLLS_MAP);
        rolls.set(roll.id, roll);
        // Il registro tiene gli ultimi MAX_ROLLS tiri: si cancellano i più vecchi.
        const excess = rolls.size - MAX_ROLLS;
        if (excess > 0) {
          const oldest = [...rolls.values()]
            .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1))
            .slice(0, excess);
          for (const old of oldest) rolls.delete(old.id);
        }
      });
    } finally {
      await connection.disconnect();
    }
    return roll;
  }
}
