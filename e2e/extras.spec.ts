import { expect, type Page, test } from "@playwright/test";
import { board, click, joinAs, setupTable } from "./helpers";

async function image(page: Page) {
  const base64 = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(120, 120);
    const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    ctx.fillStyle = "#0090ff";
    ctx.fillRect(0, 0, 120, 120);
    const bytes = new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer());
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  });
  return { name: "lettera.png", mimeType: "image/png", buffer: Buffer.from(base64, "base64") };
}

test("the GM shows the players an image straight from the room collection", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  await gm.keyboard.press("k");
  await gm.getByRole("button", { name: "Libreria" }).click();
  const picker = gm.getByRole("dialog", { name: "Libreria di immagini" });
  await picker.getByRole("button", { name: "Caricati" }).click();
  await picker.getByLabel("Immagine da aggiungere alla raccolta").setInputFiles(await image(gm));
  const cropper = gm.getByRole("dialog", { name: "Ritaglia l'immagine" });
  await expect(cropper.getByRole("button", { name: "Usa questa immagine" })).toBeEnabled();
  await cropper.getByRole("button", { name: "Usa questa immagine" }).click();

  // L'immagine non è sulla lavagna né pubblica, eppure il giocatore la riceve a tutto schermo.
  await picker.getByRole("button", { name: "Mostra ai giocatori" }).click();
  const handout = player.getByRole("dialog", { name: "Immagine mostrata dal GM" });
  await expect(handout.getByRole("img", { name: "Immagine mostrata dal GM" })).toBeVisible();
  await expect(board(gm)).toHaveAttribute("data-item-count", "0");
  await expect(gm.getByRole("status").filter({ hasText: "Stai mostrando" })).toBeVisible();
});

test("players cannot show images from the collection", async ({ browser }) => {
  const { player } = await setupTable(browser);
  await player.keyboard.press("k");
  await player.getByRole("button", { name: "Libreria" }).click();
  const picker = player.getByRole("dialog", { name: "Libreria di immagini" });
  await picker.getByRole("button", { name: "Caricati" }).click();
  await picker
    .getByLabel("Immagine da aggiungere alla raccolta")
    .setInputFiles(await image(player));
  const cropper = player.getByRole("dialog", { name: "Ritaglia l'immagine" });
  await expect(cropper.getByRole("button", { name: "Usa questa immagine" })).toBeEnabled();
  await cropper.getByRole("button", { name: "Usa questa immagine" }).click();
  await expect(picker.getByRole("button", { name: "Usa questa immagine" })).toHaveCount(1);
  await expect(picker.getByRole("button", { name: "Mostra ai giocatori" })).toHaveCount(0);
});

test("each viewer can turn the animated weather off just for themselves", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  const overlay = (page: Page) => page.locator("canvas.weather-overlay");
  await expect(player.getByRole("button", { name: "Nascondi il meteo" })).toHaveCount(0);

  await gm.keyboard.press("i");
  await gm.getByLabel("Meteo").selectOption({ label: "Pioggia" });
  await expect(overlay(player)).toHaveCount(1);

  await player.getByRole("button", { name: "Nascondi il meteo" }).click();
  await expect(overlay(player)).toHaveCount(0);
  await expect(overlay(gm)).toHaveCount(1);
  // La scelta resta anche ricaricando la pagina.
  await player.reload();
  await expect(board(player)).toHaveAttribute("data-synced", "true");
  await expect(player.getByRole("button", { name: "Mostra il meteo" })).toBeVisible();
  await expect(overlay(player)).toHaveCount(0);
});

test("the GM sends a note to every connected player at once", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  const second = await (await browser.newContext()).newPage();
  await second.goto(await gm.getByLabel("Link per i giocatori").inputValue());
  await joinAs(second, "Bilbo");

  await gm.keyboard.press("a");
  await click(gm, 300, 300);
  await gm.getByLabel("Titolo").fill("Botola");
  await gm.getByLabel("Testo della nota").fill("**CD 15** Destrezza");
  const recipient = gm.getByLabel("Invia come messaggio privato");
  await recipient.selectOption({ label: "Tutti i giocatori connessi" });
  await gm.getByRole("button", { name: "Invia", exact: true }).click();
  await expect(gm.getByText("Nota inviata a 2 giocatori.")).toBeVisible();

  // Ognuno la riceve nella conversazione con il GM, formattata.
  for (const page of [player, second]) {
    await page.getByRole("button", { name: /Nota: Botola/ }).click();
    await expect(page.locator(".bubble-note strong").first()).toHaveText("Botola");
    await expect(page.locator(".bubble-note .note-body strong")).toHaveText("CD 15");
  }
});
