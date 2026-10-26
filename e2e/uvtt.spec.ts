import { expect, test } from "@playwright/test";
import { board, setupTable } from "./helpers";

// La mappa di prova la genera scripts/sample-dd2vtt.mjs: 4 muri, 2 porte, 2 luci.
test("the GM imports a Universal VTT map with its walls, doors and lights", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  await gm.locator("input[type=file]").first().setInputFiles("e2e/fixtures/sample.dd2vtt");

  await expect(gm.getByRole("status").filter({ hasText: "Mappa importata" })).toHaveText(
    /4 muri, 2 porte e 2 luci/,
  );
  // L'immagine e le due luci arrivano a tutti in un solo passo; muri e porte pure.
  await expect(board(player)).toHaveAttribute("data-item-count", "3");
  await expect(board(player)).toHaveAttribute("data-wall-count", "6");
  // La griglia, spenta, si accende allineata alla mappa.
  await expect(board(player)).toHaveCSS("background-image", "none");

  await gm.keyboard.press("Control+z");
  await expect(board(player)).toHaveAttribute("data-item-count", "0");
  await expect(board(player)).toHaveAttribute("data-wall-count", "0");
});

test("players cannot import Universal VTT maps", async ({ browser }) => {
  const { player } = await setupTable(browser);
  await player.locator("input[type=file]").first().setInputFiles("e2e/fixtures/sample.dd2vtt");
  await expect(
    player.getByRole("status").filter({ hasText: "Formato non supportato" }),
  ).toBeVisible();
  await expect(board(player)).toHaveAttribute("data-item-count", "0");
});
