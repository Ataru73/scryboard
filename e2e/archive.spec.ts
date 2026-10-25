import { expect, test } from "@playwright/test";
import { board, joinAs, placeToken, tokenList } from "./helpers";

test("the GM exports a room and imports it as a new one", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Nome della stanza").fill("Miniera");
  await page.getByRole("button", { name: "Crea stanza come GM" }).click();
  await joinAs(page, "Master");
  await placeToken(page, "Orco", 175, 175);
  const scenes = page.getByRole("region", { name: "Scene" });
  await scenes.getByLabel("Nome della nuova scena").fill("Cantina");
  await scenes.getByRole("button", { name: "Aggiungi" }).click();
  // Prima si aspetta il passaggio alla scena nuova, poi che si sincronizzi.
  await expect(page.getByText("Stai preparando «Cantina»")).toBeVisible();
  await expect(board(page)).toHaveAttribute("data-synced", "true");
  await placeToken(page, "Ratto", 225, 225);
  const firstRoom = page.url();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Esporta la stanza" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Miniera.scryboard");
  const path = await file.path();

  // Una stanza nuova, da zero: nuovi link, stesse scene e oggetti.
  await page.goto("/");
  await page.getByLabel("File della stanza da importare").setInputFiles(path);
  // Il profilo è già salvato in questo browser: si entra direttamente nella stanza nuova.
  await expect(page.getByText("Connesso")).toBeVisible();
  expect(page.url()).not.toBe(firstRoom);
  await expect(board(page)).toHaveAttribute("data-synced", "true");
  await expect(page.getByRole("heading", { name: "Miniera" })).toBeVisible();
  await expect(tokenList(page).getByText("Orco")).toBeVisible();
  const copy = page.getByRole("region", { name: "Scene" });
  await expect(copy.getByRole("button", { name: "Cantina", exact: true })).toBeVisible();
  await copy.getByRole("button", { name: "Cantina", exact: true }).click();
  await expect(tokenList(page).getByText("Ratto")).toBeVisible();
});

test("a file that is not an archive is refused with a message", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("File della stanza da importare").setInputFiles({
    name: "falso.scryboard",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("non sono uno zip"),
  });
  await expect(page.getByText(/Non è stato possibile importare la stanza/)).toBeVisible();
  await expect(page.getByText(/archivio di Scryboard valido/)).toBeVisible();
});
