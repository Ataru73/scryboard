import { expect, test } from "@playwright/test";
import { board, click, placeToken, setupTable } from "./helpers";

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

test("Ctrl+A selects only the tokens and drawings one can edit", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  await placeToken(gm, "Goblin", 105, 405);
  await placeToken(gm, "Coboldo", 245, 405);
  await placeToken(player, "Arwen", 385, 405);
  await expect(board(gm)).toHaveAttribute("data-item-count", "3");

  // Il GM blocca il coboldo: il giocatore seleziona e cancella tutto il resto.
  await gm.keyboard.press("v");
  await click(gm, 245, 405);
  await gm.getByRole("button", { name: "Blocca" }).click();
  await player.keyboard.press("v");
  await player.keyboard.press("Control+a");
  await player.keyboard.press("Delete");
  await expect(board(gm)).toHaveAttribute("data-item-count", "1");

  // Anche per il GM un oggetto bloccato resta fuori finché non lo sblocca.
  await gm.getByRole("button", { name: "Sblocca" }).click();
  await gm.keyboard.press("Control+a");
  await gm.keyboard.press("Delete");
  await expect(board(player)).toHaveAttribute("data-item-count", "0");
});
