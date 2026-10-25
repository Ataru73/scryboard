import { expect, type Page, test } from "@playwright/test";
import { click, setupTable } from "./helpers";

async function image(page: Page) {
  const base64 = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(120, 120);
    const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    ctx.fillStyle = "#8e4ec6";
    ctx.fillRect(0, 0, 120, 120);
    const bytes = new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer());
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  });
  return { name: "boss.png", mimeType: "image/png", buffer: Buffer.from(base64, "base64") };
}

test("the GM stages an image in the room collection and reuses it for a token", async ({
  browser,
}) => {
  const { gm } = await setupTable(browser);
  await gm.keyboard.press("k");
  await gm.getByRole("button", { name: "Libreria" }).click();
  const picker = gm.getByRole("dialog", { name: "Libreria di immagini" });
  await picker.getByRole("button", { name: "Caricati" }).click();
  await expect(picker.getByText("Nessuna immagine caricata")).toBeVisible();

  // Si carica senza piazzare nulla sulla lavagna.
  await picker.getByLabel("Immagine da aggiungere alla raccolta").setInputFiles(await image(gm));
  const cropper = gm.getByRole("dialog", { name: "Ritaglia l'immagine" });
  await expect(cropper.getByRole("button", { name: "Usa questa immagine" })).toBeEnabled();
  await cropper.getByRole("button", { name: "Usa questa immagine" }).click();
  const staged = picker.getByRole("button", { name: "Usa questa immagine (solo GM)" });
  await expect(staged).toHaveCount(1);
  await expect(gm.getByRole("application", { name: "Lavagna" })).toHaveAttribute(
    "data-item-count",
    "0",
  );

  // La si sceglie: il token piazzato dopo usa quell'immagine.
  await staged.click();
  await expect(gm.getByRole("button", { name: "Togli immagine" })).toBeVisible();
  await gm.getByLabel("Nome del token").fill("Boss");
  await click(gm, 175, 175);
  await expect(gm.getByRole("application", { name: "Lavagna" })).toHaveAttribute(
    "data-item-count",
    "1",
  );
});
