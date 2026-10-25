import { expect, test } from "@playwright/test";
import { setupTable } from "./helpers";

test("everyone sees the rolls, the GM can roll in secret, /r works from chat", async ({
  browser,
}) => {
  const { gm, player } = await setupTable(browser);
  for (const page of [gm, player]) {
    await page.getByRole("button", { name: "Tavolo", exact: true }).click();
  }

  await player.getByLabel("Formula dei dadi").fill("8d6+2");
  await player.getByRole("button", { name: "Tira" }).click();
  const gmLog = gm.getByRole("list", { name: "Registro dei tiri" });
  const playerLog = player.getByRole("list", { name: "Registro dei tiri" });
  await expect(gmLog.getByText("8d6+2")).toBeVisible();
  const total = Number(await gmLog.getByLabel("Totale di Arwen").textContent());
  expect(total).toBeGreaterThanOrEqual(10);
  expect(total).toBeLessThanOrEqual(50);
  await expect(playerLog.getByLabel("Totale di Arwen")).toHaveText(String(total));
  // Il tiro compare anche sulla lavagna, per tutti.
  await expect(gm.getByRole("status", { name: "Ultimi tiri" })).toContainText("Arwen");

  // Formule non valide si spiegano.
  await player.getByLabel("Formula dei dadi").fill("1d1");
  await player.getByRole("button", { name: "Tira" }).click();
  await expect(player.getByRole("alert")).toContainText("facce");

  // Il GM tira di nascosto: lo vede solo lui.
  await gm.getByLabel(/Tira di nascosto/).check();
  await gm.getByRole("button", { name: "d20" }).click();
  await expect(gmLog.getByText("(nascosto)")).toBeVisible();
  await expect(playerLog.getByText("Master")).toHaveCount(0);
  await gm.getByLabel(/Tira di nascosto/).uncheck();

  // «/r» in una conversazione tira in pubblico.
  await player.getByRole("button", { name: "Privati" }).click();
  await player.getByLabel("Scrivi a").selectOption({ label: "GM" });
  await player.getByLabel("Messaggio").fill("/r 1d4");
  await player.getByRole("button", { name: "Invia" }).click();
  await gm.getByRole("button", { name: "Tavolo", exact: true }).click();
  await expect(gmLog.getByText("1d4", { exact: true })).toBeVisible();
});
