import { expect, test } from "@playwright/test";
import { openToolGroup, setupTable } from "./helpers";

test("tools are grouped: one group open at a time, shortcuts still work", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);

  // Il gruppo mostra l'ultimo strumento usato, anche se scelto con la tastiera.
  await gm.keyboard.press("w");
  const visibility = gm.getByRole("button", { name: /^Visibilità:/ });
  await expect(visibility).toHaveAccessibleName("Visibilità: Muri");
  await expect(visibility).toHaveAttribute("aria-pressed", "true");

  // Aprirne uno chiude l'altro; scegliere uno strumento chiude il gruppo.
  const draw = await openToolGroup(gm, "Disegno");
  await expect(draw.getByRole("button")).toHaveCount(6);
  const map = await openToolGroup(gm, "Mappa");
  await expect(draw).toHaveCount(0);
  await map.getByRole("button", { name: "Tetti", exact: true }).click();
  await expect(map).toHaveCount(0);
  await expect(gm.getByRole("button", { name: /^Mappa:/ })).toHaveAccessibleName("Mappa: Tetti");
  await expect(gm.getByRole("toolbar", { name: "Tetti" })).toBeVisible();

  // Esc chiude il gruppo e riporta il focus sul suo pulsante.
  await openToolGroup(gm, "Disegno");
  await gm.keyboard.press("Escape");
  await expect(gm.getByRole("toolbar", { name: "Disegno", exact: true })).toHaveCount(0);
  await expect(gm.getByRole("button", { name: /^Disegno:/ })).toBeFocused();

  // Il giocatore ha solo il gruppo del disegno e carica le immagini direttamente.
  await expect(player.getByRole("button", { name: /^Mappa:/ })).toHaveCount(0);
  await expect(player.getByRole("button", { name: /^Visibilità:/ })).toHaveCount(0);
  await expect(player.getByRole("button", { name: "Carica immagine" })).toBeVisible();
});
