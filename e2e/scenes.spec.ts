import { expect, test } from "@playwright/test";
import { board, placeToken, setupTable, tokenList } from "./helpers";

test("the GM prepares a scene in the background and moves the party there", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  const scenes = gm.getByRole("region", { name: "Scene" });
  await placeToken(gm, "Oste", 175, 175);
  await expect(tokenList(player).getByText("Oste")).toBeVisible();

  // Nuova scena: si apre per prepararla e i giocatori restano dove sono.
  await scenes.getByLabel("Nome della nuova scena").fill("Dungeon");
  await scenes.getByRole("button", { name: "Aggiungi" }).click();
  await expect(
    gm.getByRole("status").filter({ hasText: "Stai preparando «Dungeon»" }),
  ).toBeVisible();
  await expect(board(gm)).toHaveAttribute("data-synced", "true");
  await expect(tokenList(gm).getByText("Oste")).toHaveCount(0);
  await placeToken(gm, "Goblin", 175, 175);
  await expect(tokenList(gm).getByText("Goblin")).toBeVisible();
  await expect(tokenList(player).getByText("Goblin")).toHaveCount(0);
  await expect(tokenList(player).getByText("Oste")).toBeVisible();
  // Il GM può tornare a guardare la scena dei giocatori, e poi di nuovo a quella in preparazione.
  await gm.getByRole("button", { name: "Torna ai giocatori" }).click();
  await expect(tokenList(gm).getByText("Oste")).toBeVisible();
  await scenes.getByRole("button", { name: "Dungeon", exact: true }).click();
  await expect(tokenList(gm).getByText("Goblin")).toBeVisible();

  // Sposta qui il gruppo: i giocatori passano alla nuova scena senza ricaricare.
  await scenes.getByRole("button", { name: "Sposta qui il gruppo" }).click();
  await expect(tokenList(player).getByText("Goblin")).toBeVisible();
  await expect(tokenList(player).getByText("Oste")).toHaveCount(0);
  await expect(gm.getByText("Stai preparando")).toHaveCount(0);
  await expect(board(player)).toHaveAttribute("data-synced", "true");
});

test("scenes can be renamed, duplicated and deleted, but not the one the players are in", async ({
  browser,
}) => {
  const { gm } = await setupTable(browser);
  const scenes = gm.getByRole("region", { name: "Scene" });
  await placeToken(gm, "Oste", 175, 175);

  await scenes.getByRole("button", { name: "Duplica Scena 1" }).click();
  await expect(scenes.getByRole("button", { name: "Scena 1 (copia)", exact: true })).toBeVisible();
  await expect(board(gm)).toHaveAttribute("data-synced", "true");
  await expect(tokenList(gm).getByText("Oste")).toBeVisible();

  await scenes.getByRole("button", { name: "Rinomina Scena 1 (copia)" }).click();
  await scenes.getByLabel("Nuovo nome della scena").fill("Cantina");
  await scenes.getByLabel("Nuovo nome della scena").press("Enter");
  await expect(scenes.getByRole("button", { name: "Cantina", exact: true })).toBeVisible();

  // La scena dei giocatori non si elimina; l'altra sì, con una conferma.
  await expect(scenes.getByRole("button", { name: "Elimina Scena 1" })).toHaveCount(0);
  await scenes.getByRole("button", { name: "Elimina Cantina" }).click();
  await scenes.getByRole("button", { name: "Conferma l'eliminazione di Cantina" }).click();
  await expect(scenes.getByRole("button", { name: "Cantina", exact: true })).toHaveCount(0);
  await expect(tokenList(gm).getByText("Oste")).toBeVisible();
  await expect(gm.getByText("Stai preparando")).toHaveCount(0);
});
