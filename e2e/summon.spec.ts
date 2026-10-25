import { expect, test } from "@playwright/test";
import { at, drag, setupTable } from "./helpers";

test("an off-screen ping shows an arrow that centers the view", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  // La giocatrice si sposta lontano dal punto che il GM indicherà.
  await player.keyboard.press("h");
  await drag(player, [700, 300], [100, 300]);

  const p = await at(gm, 200, 200);
  await gm.mouse.move(p.x, p.y);
  await gm.mouse.down();
  await gm.waitForTimeout(800);
  await gm.mouse.up();

  const arrow = player.getByRole("button", { name: /Ping di Master fuori vista/ });
  await expect(arrow).toBeVisible();
  await arrow.click();
  await expect(arrow).toHaveCount(0);
});

test("the GM summons the players to their view", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  const zoom = (page: typeof gm) => page.locator(".zoom-level");
  await gm.getByRole("button", { name: "Ingrandisci" }).click();
  await gm.getByRole("button", { name: "Ingrandisci" }).click();
  await expect(zoom(gm)).toHaveText("156%");
  await expect(zoom(player)).toHaveText("100%");
  await expect(player.getByRole("button", { name: "Porta qui i giocatori" })).toHaveCount(0);

  await gm.getByRole("button", { name: "Porta qui i giocatori" }).click();
  await expect(zoom(player)).toHaveText("156%");
  // Il GM non si sposta.
  await expect(zoom(gm)).toHaveText("156%");

  // Anche con Maiusc + pressione prolungata, su un altro punto e con un altro ingrandimento.
  await gm.getByRole("button", { name: "Riduci" }).click();
  const target = await at(gm, 300, 250);
  await gm.mouse.move(target.x, target.y);
  await gm.keyboard.down("Shift");
  await gm.mouse.down();
  await gm.waitForTimeout(800);
  await gm.mouse.up();
  await gm.keyboard.up("Shift");
  await expect(zoom(player)).toHaveText("125%");
});
