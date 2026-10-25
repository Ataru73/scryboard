import { expect, test } from "@playwright/test";
import { setupTable } from "./helpers";

test("everyone sees the rolls, the GM can roll in secret, /r works from chat", async ({
  browser,
}) => {
  const { gm, player } = await setupTable(browser);
  for (const page of [gm, player]) {
    await page.getByRole("button", { name: "Dadi", exact: true }).click();
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
  // Il tiro compare anche sulla lavagna, per tutti, con i dadi 2D animati.
  await gm.emulateMedia({ reducedMotion: "reduce" });
  const recent = gm.getByRole("status", { name: "Ultimi tiri" });
  await expect(recent).toContainText("Arwen");
  await expect(recent.locator(".roll-die")).toHaveCount(8);
  const animationCount = await recent
    .locator(".roll-die")
    .first()
    .evaluate((el) => el.getAnimations({ subtree: true }).length);
  expect(animationCount).toBeGreaterThan(0);
  await expect(recent.locator(".roll-die.settled")).toHaveCount(8);

  // Formule non valide si spiegano.
  await player.getByLabel("Formula dei dadi").fill("1d1");
  await player.getByRole("button", { name: "Tira" }).click();
  await expect(player.getByRole("alert")).toContainText("facce");
  // L'errore sta subito sotto il campo, in vista, e non in fondo a una barra che scorre.
  await expect(player.getByRole("alert")).toBeInViewport();

  // Il GM tira di nascosto: lo vede solo lui.
  await gm.getByLabel(/Tira di nascosto/).check();
  await gm.getByRole("button", { name: "d20" }).click();
  await expect(gmLog.getByText("(nascosto)")).toBeVisible();
  await expect(playerLog.getByText("Master")).toHaveCount(0);
  await gm.getByLabel(/Tira di nascosto/).uncheck();

  // «/r» in una conversazione tira in pubblico.
  await player.getByRole("button", { name: "Messaggi" }).click();
  await player.getByLabel("Scrivi a").selectOption({ label: "GM" });
  await player.getByLabel("Messaggio").fill("/r 1d4");
  await player.getByRole("button", { name: "Invia" }).click();
  await gm.getByRole("button", { name: "Dadi", exact: true }).click();
  await expect(gmLog.getByText("1d4", { exact: true })).toBeVisible();
});

test("success pools show their successes and formulas can be saved as presets", async ({
  browser,
}) => {
  const { gm, player } = await setupTable(browser);
  for (const page of [gm, player]) {
    await page.getByRole("button", { name: "Dadi", exact: true }).click();
  }
  const playerLog = player.getByRole("list", { name: "Registro dei tiri" });

  await player.getByLabel("Formula dei dadi").fill("10d10!>=7");
  await player.getByRole("button", { name: "Tira" }).click();
  const entry = playerLog.getByRole("listitem").filter({ hasText: "10d10!>=7" });
  await expect(entry).toHaveCount(1);
  await expect(entry.getByText(/successi?/)).toBeVisible();
  // Il GM vede lo stesso tiro, con il numero di successi come totale.
  const total = Number(
    await entry.locator("output").evaluate((el) => el.childNodes[0]?.textContent),
  );
  const gmEntry = gm
    .getByRole("list", { name: "Registro dei tiri" })
    .getByRole("listitem")
    .filter({ hasText: "10d10!>=7" });
  await expect(gmEntry.locator("output")).toContainText(String(total));

  // Una formula non valida non si può salvare; una valida sì, e resta dopo il ricaricamento.
  const save = player.getByRole("button", { name: "Salva", exact: true });
  await player.getByLabel("Formula dei dadi").fill("1d10!1");
  await expect(save).toBeDisabled();
  await player.getByLabel("Formula dei dadi").fill("8d10 ! >= 8");
  await expect(save).toBeEnabled();
  await save.click();
  const presets = player.getByRole("region", { name: "Formule salvate" });
  await expect(presets.getByRole("button", { name: "8d10!>=8", exact: true })).toBeVisible();
  await expect(save).toBeDisabled(); // già salvata

  await player.reload();
  await player.getByRole("button", { name: "Dadi", exact: true }).click();
  await presets.getByRole("button", { name: "8d10!>=8", exact: true }).click();
  await expect(
    player
      .getByRole("list", { name: "Registro dei tiri" })
      .getByRole("listitem")
      .filter({ hasText: "8d10!>=8" }),
  ).toHaveCount(1);

  await presets.getByRole("button", { name: "Togli la formula 8d10!>=8" }).click();
  await expect(presets.getByRole("button", { name: "8d10!>=8", exact: true })).toHaveCount(0);
});
