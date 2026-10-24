import { HocuspocusProvider } from "@hocuspocus/provider";
import { expect, type Page, test } from "@playwright/test";
import * as Y from "yjs";
import { board, setupTable } from "./helpers";

/** Dopo T3 il portrait si sceglie dalla Libreria; qui lo imposta un client Yjs come farebbe il GM. */
async function addTokens(gm: Page, tokens: { id: string; x: number; portrait?: string }[]) {
  const url = new URL(await gm.getByLabel("Link GM (tienilo segreto)").inputValue());
  const roomId = url.pathname.split("/").pop() as string;
  const token = new URLSearchParams(url.hash.slice(1)).get("gm") as string;
  const doc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: `ws://${url.host}/collab`,
    name: `room:${roomId}:public`,
    document: doc,
    token,
  });
  await new Promise<void>((resolve) => provider.on("synced", () => resolve()));
  doc.transact(() => {
    for (const [i, t] of tokens.entries()) {
      doc.getMap("items").set(t.id, {
        id: t.id,
        layer: "token",
        x: t.x,
        y: 200,
        rotation: 0,
        z: i,
        locked: false,
        createdBy: "test",
        kind: "token",
        name: t.id,
        color: "#46a758",
        assetId: null,
        size: 2,
        ...(t.portrait ? { portrait: t.portrait } : {}),
      });
    }
  });
  await expect(board(gm)).toHaveAttribute("data-item-count", String(tokens.length));
  provider.destroy();
}

const paths = (page: Page) =>
  page.evaluate(() => {
    const { Konva } = window as unknown as {
      Konva: { stages: { find: (s: string) => { className: string }[] }[] };
    };
    return Konva.stages[0]?.find("Path").length ?? 0;
  });

test("a token with a library portrait shows the silhouette; unknown ids fall back to initials", async ({
  browser,
}) => {
  const { gm, player } = await setupTable(browser);
  await addTokens(gm, [
    { id: "Goblin", x: 200, portrait: "goblin" },
    { id: "Drago", x: 400, portrait: "drago" },
    { id: "Fantasma", x: 600, portrait: "non-esiste" },
    { id: "Mago", x: 800 },
  ]);
  for (const page of [gm, player]) {
    await expect.poll(() => paths(page)).toBe(2);
  }
});
