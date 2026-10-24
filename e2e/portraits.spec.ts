import { HocuspocusProvider } from "@hocuspocus/provider";
import { expect, type Page, test } from "@playwright/test";
import * as Y from "yjs";
import { board, click, setupTable, tokenList } from "./helpers";

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
    return Konva.stages[0]?.find(".portrait").length ?? 0;
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

test("the GM picks Goblin from the library and the player sees it in the token list", async ({
  browser,
}) => {
  const { gm, player } = await setupTable(browser);
  await gm.keyboard.press("k");
  await gm.getByRole("button", { name: "Libreria", exact: true }).click();
  const dialog = gm.getByRole("dialog", { name: "Libreria di immagini" });
  await dialog.getByLabel("Cerca nella libreria").fill("goblin");
  await expect(dialog.getByRole("button", { name: "Goblin" })).toHaveCount(1);
  await dialog.getByRole("button", { name: "Goblin" }).click();
  await expect(dialog).toBeHidden();
  // Nome e taglia si adattano alla scelta.
  await expect(gm.getByLabel("Nome del token")).toHaveValue("Goblin");

  await click(gm, 300, 300);
  await expect(board(gm)).toHaveAttribute("data-item-count", "1");
  await expect(tokenList(player).getByRole("listitem")).toContainText("Goblin, ");
  await expect(tokenList(player).getByRole("listitem")).toContainText("immagine Goblin");
  await expect.poll(() => paths(player)).toBe(1);

  // Il drago nasce Enorme e "Togli immagine" riporta alle iniziali.
  await gm.getByRole("button", { name: "Libreria", exact: true }).click();
  await gm
    .getByRole("dialog", { name: "Libreria di immagini" })
    .getByRole("button", { name: "Drago", exact: true })
    .click();
  await expect(gm.getByLabel("Taglia")).toHaveValue("3");
  await gm.getByRole("button", { name: "Togli immagine" }).click();
  await expect(gm.getByRole("button", { name: "Togli immagine" })).toHaveCount(0);
});

test("a selected token can change its library image", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  await gm.keyboard.press("k");
  await gm.getByLabel("Nome del token").fill("Boss");
  await click(gm, 300, 300);
  await gm.keyboard.press("v");
  await click(gm, 300, 300);
  const panel = gm.getByRole("toolbar", { name: "Selezione" });
  await panel.getByRole("button", { name: "Libreria", exact: true }).click();
  await gm
    .getByRole("dialog", { name: "Libreria di immagini" })
    .getByRole("button", { name: "Troll", exact: true })
    .click();
  await expect.poll(() => paths(player)).toBe(1);
  await expect(tokenList(player).getByRole("listitem")).toContainText("immagine Troll");
  // Il nome scelto dal GM non viene sovrascritto.
  await expect(tokenList(player).getByRole("listitem")).toContainText("Boss");
});

test("credits list the icon authors from the home page and from the room", async ({
  browser,
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Crediti" }).click();
  const credits = page.getByRole("dialog", { name: "Crediti" });
  await expect(credits).toContainText("Creative Commons Attribution 3.0");
  await expect(credits.getByRole("listitem").filter({ hasText: "Lorc" })).toHaveCount(1);
  await expect(credits.getByRole("listitem").filter({ hasText: "Delapouite" })).toHaveCount(1);
  await credits.getByRole("button", { name: "Chiudi" }).click();
  await expect(credits).toBeHidden();

  const { gm } = await setupTable(browser);
  await gm.getByRole("button", { name: "Crediti" }).click();
  await expect(gm.getByRole("dialog", { name: "Crediti" })).toContainText("game-icons.net");
});
