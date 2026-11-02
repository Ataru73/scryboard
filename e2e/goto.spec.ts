import { expect, test } from "@playwright/test";
import { board, click, drag, placeToken, setupTable } from "./helpers";

test("G centers the view on your own token, or on the selection", async ({ browser }) => {
  const { player } = await setupTable(browser);
  await placeToken(player, "Legolas", 120, 120);
  await player.keyboard.press("h");
  // Si sposta la vista lontano: il token esce dallo schermo.
  await drag(player, [500, 400], [100, 100]);
  await drag(player, [500, 400], [100, 100]);
  await player.keyboard.press("v");
  const selection = player.getByRole("toolbar", { name: "Selezione" });
  await expect(selection).toHaveCount(0);

  await player.keyboard.press("g");
  const box = await board(player).boundingBox();
  if (!box) throw new Error("board not visible");
  await click(player, box.width / 2, box.height / 2);
  await expect(selection).toBeVisible();
});
