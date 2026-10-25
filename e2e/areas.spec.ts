import { expect, test } from "@playwright/test";
import { at, board, placeToken, setupTable } from "./helpers";

const status = (page: import("@playwright/test").Page) =>
  page.getByRole("status", { name: "Distanza misurata" });

async function gridOn(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Griglia" }).click();
  await page.getByLabel("Mostra la griglia").check();
  await page.getByLabel("Casella (px)").fill("50");
  await page.getByLabel("Sposta X").fill("0");
  await page.getByLabel("Sposta Y").fill("0");
  await page.getByRole("button", { name: "Chiudi" }).click();
}

test("a fireball counts the tokens inside it, and Shift pins it for everyone", async ({
  browser,
}) => {
  const { gm, player } = await setupTable(browser);
  await gridOn(gm);
  await placeToken(gm, "Goblin", 175, 175);
  await placeToken(gm, "Orco", 325, 325);
  await gm.keyboard.press("m");
  await gm.getByRole("button", { name: "Cerchio" }).click();

  // Origine sull'incrocio (150, 150), raggio di 2 caselle: contiene solo il Goblin.
  const a = await at(gm, 152, 148);
  const b = await at(gm, 252, 148);
  await gm.mouse.move(a.x, a.y);
  await gm.mouse.down();
  await gm.mouse.move(b.x, b.y, { steps: 5 });
  await expect(status(gm)).toHaveText("Cerchio 10 ft · 1 token");
  await gm.keyboard.down("Shift");
  await gm.mouse.up();
  await gm.keyboard.up("Shift");

  await expect(board(gm)).toHaveAttribute("data-item-count", "3");
  await expect(board(player)).toHaveAttribute("data-item-count", "3");
});

test("an unpinned template fades away and a token can carry an aura", async ({ browser }) => {
  const { gm } = await setupTable(browser);
  await gridOn(gm);
  await gm.keyboard.press("m");
  await gm.getByRole("button", { name: "Cono" }).click();
  const a = await at(gm, 152, 148);
  const b = await at(gm, 352, 148);
  await gm.mouse.move(a.x, a.y);
  await gm.mouse.down();
  await gm.mouse.move(b.x, b.y, { steps: 5 });
  await gm.mouse.up();
  await expect(status(gm)).toHaveText("Cono 20 ft · 0 token");
  await expect(board(gm)).toHaveAttribute("data-item-count", "0");
  await expect(status(gm)).toHaveText("", { timeout: 8000 });

  await placeToken(gm, "Paladino", 175, 275);
  await gm.keyboard.press("v");
  const t = await at(gm, 175, 275);
  await gm.mouse.click(t.x, t.y);
  await gm.getByLabel("Aura (caselle)").fill("2");
  await expect(gm.getByLabel("Aura (caselle)")).toHaveValue("2");
  await expect(gm.getByLabel("Colore dell'aura")).toBeVisible();
});
