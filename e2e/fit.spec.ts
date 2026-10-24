import { expect, test } from "@playwright/test";
import { click, setupTable } from "./helpers";

test("the fit button always has a visible effect", async ({ browser }) => {
  const { gm } = await setupTable(browser);
  const zoomLabel = gm.getByText(/^\d+%$/);
  const fit = gm.getByRole("button", { name: "Adatta al contenuto" });

  // Lavagna vuota: riporta la vista al 100%.
  await gm.getByRole("button", { name: "Ingrandisci" }).click();
  await gm.getByRole("button", { name: "Ingrandisci" }).click();
  await expect(zoomLabel).toHaveText("156%");
  await fit.click();
  await expect(zoomLabel).toHaveText("100%");

  // Un solo token piccolo: si ingrandisce (fino al 200%) invece di restare com'è.
  await gm.keyboard.press("k");
  await click(gm, 400, 300);
  await gm.keyboard.press("v");
  await fit.click();
  await expect(zoomLabel).toHaveText("200%");

  // Anche la scorciatoia fa lo stesso.
  await gm.getByRole("button", { name: "Riduci" }).click();
  await expect(zoomLabel).not.toHaveText("200%");
  await gm.keyboard.press("Shift+1");
  await expect(zoomLabel).toHaveText("200%");
});
