import { expect, test } from "@playwright/test";
import { click, drag, placeToken, setupTable, tokenList } from "./helpers";

test("a rider attached to a mount follows it, and moving alone detaches", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  await gm.getByRole("button", { name: "Griglia" }).click();
  await gm.getByLabel("Mostra la griglia").check();
  await gm.getByLabel("Casella (px)").fill("50");
  await gm.getByLabel("Sposta X").fill("0");
  await gm.getByLabel("Sposta Y").fill("0");
  await gm.getByRole("button", { name: "Chiudi" }).click();
  await placeToken(gm, "Cavallo", 175, 475);
  await placeToken(gm, "Cavaliere", 275, 475);
  await gm.keyboard.press("v");

  await click(gm, 275, 475);
  await gm.getByRole("button", { name: "Aggancia a…" }).click();
  await expect(
    gm.getByRole("status").filter({ hasText: "Clicca il token principale" }),
  ).toBeVisible();
  await click(gm, 175, 475);
  await expect(
    tokenList(gm).getByText("Cavaliere, colonna 6, riga 10, agganciato a Cavallo"),
  ).toBeVisible();
  await expect(tokenList(player).getByText(/Cavaliere.*agganciato a Cavallo/)).toBeVisible();

  // Muovendo il cavallo, il cavaliere lo segue (anche per gli altri).
  await drag(gm, [175, 475], [175, 325]);
  await expect(tokenList(gm).getByText("Cavallo, colonna 4, riga 7")).toBeVisible();
  await expect(tokenList(gm).getByText(/Cavaliere, colonna 6, riga 7, agganciato/)).toBeVisible();
  await expect(tokenList(player).getByText(/Cavaliere, colonna 6, riga 7/)).toBeVisible();

  // Spostando solo il cavaliere si sgancia.
  await drag(gm, [275, 325], [275, 225]);
  await expect(
    tokenList(gm).getByText("Cavaliere, colonna 6, riga 5", { exact: true }),
  ).toBeVisible();
  await expect(tokenList(gm).getByText(/agganciato/)).toHaveCount(0);
});

test("attaching refuses chains and deleting the mount frees the rider", async ({ browser }) => {
  const { gm } = await setupTable(browser);
  await placeToken(gm, "Cavallo", 175, 475);
  await placeToken(gm, "Cavaliere", 275, 475);
  await placeToken(gm, "Scudiero", 375, 475);
  await gm.keyboard.press("v");

  await click(gm, 275, 475);
  await gm.getByRole("button", { name: "Aggancia a…" }).click();
  await click(gm, 175, 475);
  // Lo scudiero non può agganciarsi al cavaliere, che è già agganciato.
  await click(gm, 375, 475);
  await gm.getByRole("button", { name: "Aggancia a…" }).click();
  await click(gm, 275, 475);
  await expect(gm.getByText(/è già agganciato a un altro/)).toBeVisible();
  await expect(tokenList(gm).getByText(/Scudiero.*agganciato/)).toHaveCount(0);

  // Cancellando il cavallo il cavaliere resta libero.
  await click(gm, 175, 475);
  await gm.keyboard.press("Delete");
  await expect(tokenList(gm).getByText(/agganciato/)).toHaveCount(0);
  await expect(tokenList(gm).getByText("Cavaliere")).toBeVisible();
});
