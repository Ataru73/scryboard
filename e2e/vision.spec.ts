import { expect, type Page, test } from "@playwright/test";
import { board, click, placeToken, setupTable, tokenList } from "./helpers";

async function enableGrid(gm: Page) {
  await gm.getByRole("button", { name: "Griglia", exact: true }).click();
  await gm.getByLabel("Mostra la griglia").check();
  await gm.getByRole("button", { name: "Chiudi" }).click();
}

const names = async (page: Page) =>
  (await tokenList(page).getByRole("listitem").allTextContents()).map((t) => t.split(",")[0]);

test("dynamic vision: walls hide what is behind them, night needs light, memory is kept", async ({
  browser,
}) => {
  const { gm, player } = await setupTable(browser);
  await enableGrid(gm);

  // Il giocatore piazza il suo eroe; il GM un mostro oltre un muro con una porta chiusa.
  await placeToken(player, "Eroe", 105, 315);
  await placeToken(gm, "Mostro", 455, 315);
  await gm.keyboard.press("w");
  const walls = gm.getByRole("toolbar", { name: "Muri", exact: true });
  await click(gm, 280, 140);
  await click(gm, 280, 280);
  await gm.keyboard.press("Enter");
  await click(gm, 280, 350);
  await click(gm, 280, 700);
  await gm.keyboard.press("Enter");
  await walls.getByRole("button", { name: "Porta" }).click();
  await click(gm, 280, 280);
  await click(gm, 280, 350);
  await expect(board(player)).toHaveAttribute("data-wall-count", "3");
  await expect.poll(() => names(player)).toEqual(["Eroe", "Mostro"]);

  // Con la visione dinamica il mostro dietro il muro sparisce per il giocatore, non per il GM.
  await gm.keyboard.press("i");
  const lights = gm.getByRole("toolbar", { name: "Luci" });
  await lights.getByLabel("Visione dinamica").check();
  await expect.poll(() => names(player)).toEqual(["Eroe"]);
  await expect.poll(() => names(gm)).toEqual(["Eroe", "Mostro"]);

  // La porta è dal lato del giocatore: la vede, la apre e il mostro appare.
  await player.keyboard.press("v");
  await click(player, 280, 315);
  await expect.poll(() => names(player)).toEqual(["Eroe", "Mostro"]);

  // Di notte, senza luci né scurovisione, il mostro non si vede; con una torcia vicino sì.
  await lights.getByRole("button", { name: "Notte" }).click();
  await expect.poll(() => names(player)).toEqual(["Eroe"]);
  await lights.getByRole("button", { name: /Torcia/ }).click();
  await click(gm, 525, 385);
  await expect.poll(() => names(player)).toEqual(["Eroe", "Mostro"]);
  await player.waitForTimeout(300);
  await player.screenshot({ path: "e2e/.data/vision-player-night.png" });

  // Anteprima del GM: vede come il giocatore.
  await lights.getByLabel("Vista").selectOption({ label: "Arwen" });
  await gm.waitForTimeout(300);
  await gm.screenshot({ path: "e2e/.data/vision-gm-preview.png" });

  // Le zone viste restano in memoria nel browser del giocatore.
  await player.waitForTimeout(3500);
  const remembered = await player.evaluate(() =>
    Object.keys(localStorage).some((k) => k.startsWith("scryboard:explored:")),
  );
  expect(remembered).toBe(true);
});

test("players cannot open doors they cannot see in the dark", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  await enableGrid(gm);
  await placeToken(player, "Eroe", 105, 315);
  // Una porta lontana, dietro un muro.
  await gm.keyboard.press("w");
  await click(gm, 280, 140);
  await click(gm, 280, 700);
  await gm.keyboard.press("Enter");
  await gm
    .getByRole("toolbar", { name: "Muri", exact: true })
    .getByRole("button", { name: "Porta" })
    .click();
  await click(gm, 490, 420);
  await click(gm, 560, 420);
  await gm.keyboard.press("i");
  await gm.getByRole("toolbar", { name: "Luci" }).getByLabel("Visione dinamica").check();

  await player.keyboard.press("v");
  await click(player, 525, 420);
  await player.waitForTimeout(300);
  const states = await gm.evaluate(() => {
    const { Konva } = window as unknown as {
      Konva: { stages: { find: (s: string) => { name: () => string }[] }[] };
    };
    return (Konva.stages[0]?.find(".door-icon") ?? []).map((n) => n.name());
  });
  expect(states).toEqual(["door-icon door-closed"]);
});
