import { expect, test } from "@playwright/test";
import { board, click, drag, setupTable } from "./helpers";

test("the GM paints biomes live; players see them but cannot paint", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  await expect(player.getByRole("button", { name: "Terreno" })).toHaveCount(0);
  await player.keyboard.press("b");
  await expect(player.getByRole("toolbar", { name: "Terreno" })).toHaveCount(0);

  await gm.keyboard.press("b");
  const panel = gm.getByRole("toolbar", { name: "Terreno" });

  // Prato con il pennello largo, poi una regione di sabbia e una di acqua profonda.
  await panel.getByRole("button", { name: "Larghezza 4 caselle" }).click();
  await drag(gm, [150, 250], [700, 300]);
  await expect(board(player)).toHaveAttribute("data-terrain-count", "1");

  await panel.getByRole("button", { name: "Sabbia", exact: true }).click();
  await panel.getByRole("button", { name: "Regione", exact: true }).click();
  await click(gm, 450, 380);
  await click(gm, 750, 360);
  await click(gm, 800, 600);
  await click(gm, 480, 620);
  await gm.keyboard.press("Enter");
  await panel.getByRole("button", { name: "Acqua profonda", exact: true }).click();
  await click(gm, 560, 460);
  await click(gm, 680, 450);
  await click(gm, 640, 560);
  await gm.keyboard.press("Enter");
  await expect(board(player)).toHaveAttribute("data-terrain-count", "3");

  // Gomma e annulla.
  await panel.getByRole("button", { name: "Gomma" }).click();
  await panel.getByRole("button", { name: "Larghezza 1 caselle" }).click();
  await drag(gm, [300, 200], [320, 350]);
  await expect(board(player)).toHaveAttribute("data-terrain-count", "4");
  await gm.screenshot({ path: "e2e/.data/terrain-gm.png" });
  await gm.keyboard.press("Control+z");
  await expect(board(player)).toHaveAttribute("data-terrain-count", "3");

  // Chi entra dopo trova il terreno e la vista centrata su di esso.
  await player.reload();
  await expect(player.getByText("Connesso")).toBeVisible();
  await expect(board(player)).toHaveAttribute("data-terrain-count", "3");
  await player.waitForTimeout(300);
  await player.screenshot({ path: "e2e/.data/terrain-player.png" });

  await panel.getByRole("button", { name: "Cancella terreno" }).click();
  await expect(board(player)).toHaveAttribute("data-terrain-count", "0");
});
