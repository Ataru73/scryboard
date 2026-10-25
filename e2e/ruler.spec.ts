import { expect, test } from "@playwright/test";
import { at, board, placeToken, setupTable } from "./helpers";

const distance = (page: import("@playwright/test").Page) =>
  page.getByRole("status", { name: "Distanza misurata" });

test("the ruler measures in grid units and Space adds a waypoint", async ({ browser }) => {
  const { gm } = await setupTable(browser);
  await gm.getByRole("button", { name: "Griglia" }).click();
  await gm.getByLabel("Mostra la griglia").check();
  await gm.getByLabel("Casella (px)").fill("50");
  await gm.getByLabel("Sposta X").fill("0");
  await gm.getByLabel("Sposta Y").fill("0");
  await gm.getByRole("button", { name: "Chiudi" }).click();

  await gm.getByRole("button", { name: "Righello" }).click();
  const a = await at(gm, 125, 125);
  const b = await at(gm, 325, 125);
  const c = await at(gm, 325, 275);
  await gm.mouse.move(a.x, a.y);
  await gm.mouse.down();
  await gm.mouse.move(b.x, b.y, { steps: 5 });
  await expect(distance(gm)).toHaveText("20 ft · 4 caselle");
  await gm.keyboard.press("Space");
  await gm.mouse.move(c.x, c.y, { steps: 5 });
  await expect(distance(gm)).toHaveText("35 ft · 7 caselle");
  await gm.mouse.up();
  await expect(distance(gm)).toHaveText("");
});

test("dragging a token shows the distance travelled", async ({ browser }) => {
  const { gm } = await setupTable(browser);
  await gm.getByRole("button", { name: "Griglia" }).click();
  await gm.getByLabel("Mostra la griglia").check();
  await gm.getByLabel("Casella (px)").fill("50");
  await gm.getByLabel("Sposta X").fill("0");
  await gm.getByLabel("Sposta Y").fill("0");
  await gm.getByRole("button", { name: "Chiudi" }).click();
  await placeToken(gm, "Orco", 125, 125);
  await gm.keyboard.press("v");

  const from = await at(gm, 125, 125);
  const to = await at(gm, 275, 125);
  await gm.mouse.move(from.x, from.y);
  await gm.mouse.down();
  await gm.mouse.move(to.x, to.y, { steps: 6 });
  await expect(distance(gm)).toHaveText("15 ft · 3 caselle");
  await gm.mouse.up();
  await expect(board(gm)).toBeVisible();
});
