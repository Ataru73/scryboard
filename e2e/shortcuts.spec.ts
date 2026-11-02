import { expect, test } from "@playwright/test";
import { setupTable } from "./helpers";

test("? lists the keyboard shortcuts, GM-only ones only for the GM", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  await gm.keyboard.press("?");
  const gmDialog = gm.getByRole("dialog", { name: "Scorciatoie da tastiera" });
  await expect(gmDialog).toBeVisible();
  await expect(gmDialog).toContainText("Nasconde o rivela la selezione");
  // Mentre è aperto le scorciatoie della lavagna tacciono; Esc lo chiude.
  await gm.keyboard.press("Escape");
  await expect(gmDialog).toHaveCount(0);

  await player.keyboard.press("?");
  const playerDialog = player.getByRole("dialog", { name: "Scorciatoie da tastiera" });
  await expect(playerDialog).toContainText("Puntatore laser");
  await expect(playerDialog).not.toContainText("Nasconde o rivela la selezione");
  await playerDialog.getByRole("button", { name: "Chiudi" }).click();
  await expect(playerDialog).toHaveCount(0);
});
