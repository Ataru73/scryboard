import { type Message, mailDocumentName, playerCredentials } from "@scryboard/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, createRoom, startTestServer, type TestServer, tempDatabasePath } from "./helpers";

const players = {
  arwen: { id: "a1a1a1a1a1a1a1a1", secret: "arwen-secret-0123456789" },
  bilbo: { id: "b2b2b2b2b2b2b2b2", secret: "bilbo-secret-0123456789" },
  carlo: { id: "c3c3c3c3c3c3c3c3", secret: "carlo-secret-0123456789" },
};
type Who = keyof typeof players;
const creds = (who: Who) => playerCredentials(players[who].id, players[who].secret);

describe("private messages", () => {
  let server: TestServer;
  let cleanup: () => void;

  beforeAll(async () => {
    const db = tempDatabasePath();
    cleanup = db.cleanup;
    server = await startTestServer(db.path);
  });
  afterAll(async () => {
    await server.stop();
    cleanup();
  });

  async function table() {
    const room = await createRoom(server);
    const mailbox = async (who: Who | "gm") => {
      const result = await connect(
        server,
        mailDocumentName(room.id, who === "gm" ? "gm" : players[who].id),
        who === "gm" ? room.gmToken : creds(who),
      );
      if (result.status !== "synced") throw new Error(`${who}: ${result.status}`);
      return result;
    };
    // Ognuno apre la sua casella: così i giocatori si registrano.
    const boxes = {
      gm: await mailbox("gm"),
      arwen: await mailbox("arwen"),
      bilbo: await mailbox("bilbo"),
      carlo: await mailbox("carlo"),
    };
    const send = (auth: string, body: Record<string, unknown>) =>
      fetch(`${server.baseUrl}/api/rooms/${room.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: auth },
        body: JSON.stringify(body),
      });
    const texts = (who: keyof typeof boxes) =>
      boxes[who].doc
        .getArray<Message>("messages")
        .toArray()
        .map((m) => m.text);
    const close = () => {
      for (const b of Object.values(boxes)) b.provider.destroy();
    };
    return { room, boxes, send, texts, close };
  }
  const settle = () => new Promise((r) => setTimeout(r, 150));

  it("delivers a player-to-player message to both of them and to the GM only", async () => {
    const { send, texts, close } = await table();
    const res = await send(`Player ${creds("arwen")}`, {
      to: players.bilbo.id,
      text: "Ci vediamo alla taverna",
      fromName: "Arwen",
    });
    expect(res.status).toBe(201);
    await settle();
    expect(texts("arwen")).toEqual(["Ci vediamo alla taverna"]);
    expect(texts("bilbo")).toEqual(["Ci vediamo alla taverna"]);
    expect(texts("gm")).toEqual(["Ci vediamo alla taverna"]);
    expect(texts("carlo")).toEqual([]);
    close();
  });

  it("lets the GM write to a player and players write to the GM", async () => {
    const { room, boxes, send, texts, close } = await table();
    expect((await send("Bearer placeholder", { to: "gm", text: "x", fromName: "?" })).status).toBe(
      401,
    );
    const gmRes = await send(`Bearer ${room.gmToken}`, {
      to: players.carlo.id,
      text: "Senti un rumore",
      fromName: "Master",
    });
    expect(gmRes.status).toBe(201);
    expect(
      (
        await send(`Player ${creds("carlo")}`, {
          to: "gm",
          text: "Apro la porta",
          fromName: "Carlo",
        })
      ).status,
    ).toBe(201);
    await settle();
    expect(texts("carlo")).toEqual(["Senti un rumore", "Apro la porta"]);
    expect(texts("gm")).toEqual(["Senti un rumore", "Apro la porta"]);
    const last = boxes.gm.doc.getArray<Message>("messages").get(1);
    expect(last).toMatchObject({
      from: players.carlo.id,
      fromName: "Carlo",
      to: "gm",
      toName: "GM",
    });
    expect(texts("arwen")).toEqual([]);
    close();
  });

  it("rejects impersonation, unknown recipients and messages to oneself", async () => {
    const { send, close } = await table();
    const fake = playerCredentials(players.arwen.id, "not-the-real-secret-123");
    expect(
      (await send(`Player ${fake}`, { to: "gm", text: "Sono Arwen", fromName: "Arwen" })).status,
    ).toBe(401);
    expect(
      (
        await send(`Player ${creds("arwen")}`, {
          to: "d4d4d4d4d4d4d4d4",
          text: "?",
          fromName: "Arwen",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send(`Player ${creds("arwen")}`, {
          to: players.arwen.id,
          text: "?",
          fromName: "Arwen",
        })
      ).status,
    ).toBe(400);
    close();
  });

  it("keeps mailboxes private and read-only", async () => {
    const { room, boxes, texts, close } = await table();
    // Carlo prova a leggere la casella di Bilbo: con le sue credenziali o con l'id di Bilbo.
    expect(
      (await connect(server, mailDocumentName(room.id, players.bilbo.id), creds("carlo"))).status,
    ).toBe("denied");
    const stolen = playerCredentials(players.bilbo.id, players.carlo.secret);
    expect(
      (await connect(server, mailDocumentName(room.id, players.bilbo.id), stolen)).status,
    ).toBe("denied");
    expect((await connect(server, mailDocumentName(room.id, "gm"), creds("carlo"))).status).toBe(
      "denied",
    );
    // Scrivere direttamente nella propria casella non ha effetto sul server.
    boxes.carlo.doc.getArray("messages").push([{ text: "falso" }]);
    await settle();
    const fresh = await connect(
      server,
      mailDocumentName(room.id, players.carlo.id),
      creds("carlo"),
    );
    if (fresh.status !== "synced") throw new Error("not synced");
    expect(fresh.doc.getArray("messages").length).toBe(0);
    expect(texts("gm")).toEqual([]);
    fresh.provider.destroy();
    close();
  });
});
