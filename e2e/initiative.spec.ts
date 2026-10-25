import { expect, test } from "@playwright/test";
import { click, placeToken, setupTable } from "./helpers";

test("the GM runs the turn order and players follow it", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  await placeToken(gm, "Aldo", 175, 175);
  await placeToken(gm, "Bruna", 325, 175);
  await gm.keyboard.press("v");
  await gm.getByRole("button", { name: "Turni" }).click();
  await player.getByRole("button", { name: "Turni" }).click();
  const gmPanel = gm.getByRole("region", { name: "Turni" });
  const playerPanel = player.getByRole("region", { name: "Turni" });
  await expect(playerPanel.getByText("non ha ancora fissato")).toBeVisible();

  await click(gm, 175, 175);
  await gmPanel.getByRole("button", { name: "Aggiungi selezione" }).click();
  await click(gm, 325, 175);
  await gmPanel.getByRole("button", { name: "Aggiungi selezione" }).click();
  await gmPanel.getByLabel("Iniziativa di Aldo").fill("5");
  await gmPanel.getByLabel("Iniziativa di Aldo").press("Enter");
  await gmPanel.getByLabel("Iniziativa di Bruna").fill("15");
  await gmPanel.getByLabel("Iniziativa di Bruna").press("Enter");

  const names = (panel: typeof gmPanel) => panel.locator(".initiative-name");
  await expect(names(playerPanel)).toHaveText(["Bruna", "Aldo"]);

  await gmPanel.getByRole("button", { name: "Avanti" }).click();
  await expect(playerPanel.locator("li[aria-current=step] .initiative-name")).toHaveText("Bruna");
  await gm.keyboard.press("n");
  await expect(playerPanel.locator("li[aria-current=step] .initiative-name")).toHaveText("Aldo");
  await gmPanel.getByRole("button", { name: "Avanti" }).click();
  await expect(playerPanel.getByText("Round 2")).toBeVisible();
  await expect(playerPanel.locator("li[aria-current=step] .initiative-name")).toHaveText("Bruna");

  // I giocatori ritoccano i valori ma non gestiscono l'ordine.
  await playerPanel.getByLabel("Iniziativa di Aldo").fill("20");
  await playerPanel.getByLabel("Iniziativa di Aldo").press("Enter");
  await expect(names(gmPanel)).toHaveText(["Aldo", "Bruna"]);
  await expect(playerPanel.getByRole("button", { name: "Avanti" })).toHaveCount(0);

  await gmPanel.getByRole("button", { name: "Fine combattimento" }).click();
  await expect(playerPanel.getByText("Round 1")).toBeVisible();
  await expect(names(playerPanel)).toHaveCount(0);
});

test("hidden tokens in the order are not shown to players", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  await placeToken(gm, "Drago", 175, 175);
  await gm.keyboard.press("v");
  await click(gm, 175, 175);
  await gm.getByRole("button", { name: "Turni" }).click();
  await gm.getByRole("button", { name: "Aggiungi selezione" }).click();
  await gm.getByRole("button", { name: "Nascondi" }).click();
  await player.getByRole("button", { name: "Turni" }).click();
  await expect(gm.locator(".initiative-name")).toContainText("Drago");
  await expect(
    player.getByRole("region", { name: "Turni" }).locator(".initiative-name"),
  ).toHaveCount(0);
});
