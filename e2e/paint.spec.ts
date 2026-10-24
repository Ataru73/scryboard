import { expect, type Page, test } from "@playwright/test";
import { board, click, drag, setupTable } from "./helpers";

const terrainCount = async (page: Page) =>
  Number(await board(page).getAttribute("data-terrain-count"));

test("quick palette, closed-area fill, copy/paste and painting under the fog", async ({
  browser,
}) => {
  const { gm, player } = await setupTable(browser);
  await gm.keyboard.press("b");
  const panel = gm.getByRole("toolbar", { name: "Terreno" });

  // Tasti 1–9: all'inizio i primi nove biomi; il 6 è la sabbia. Dopo averla usata diventa l'1.
  await gm.keyboard.press("6");
  await expect(panel.getByRole("button", { name: "Sabbia", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await panel.getByRole("button", { name: "Larghezza 2 caselle" }).click();
  await drag(gm, [200, 300], [500, 320]);
  await expect(board(player)).toHaveAttribute("data-terrain-count", "1");
  await expect(panel.getByRole("button", { name: "1: Sabbia" })).toBeVisible();

  // Riempimento: un'area aperta viene rifiutata; una stanza chiusa da muri si riempie.
  await panel.getByRole("button", { name: "Riempi" }).click();
  await click(gm, 700, 600);
  await expect(gm.getByText(/L'area non è chiusa/)).toBeVisible();
  await gm.keyboard.press("w");
  await click(gm, 620, 420);
  await click(gm, 900, 420);
  await click(gm, 900, 650);
  await click(gm, 620, 650);
  await click(gm, 620, 420);
  await gm.keyboard.press("Enter");
  await gm.keyboard.press("b");
  await panel.getByRole("button", { name: "Roccia", exact: true }).click();
  await click(gm, 760, 530);
  await expect(board(player)).toHaveAttribute("data-terrain-count", "2");

  // Copia il tratto di sabbia e incollalo più in basso.
  await panel.getByRole("button", { name: "Copia" }).click();
  await drag(gm, [180, 260], [520, 360]);
  await expect(gm.getByText(/Copiate 1 pennellata/)).toBeVisible();
  await click(gm, 350, 600);
  await expect(board(player)).toHaveAttribute("data-terrain-count", "3");
  await gm.screenshot({ path: "e2e/.data/paint-gm.png" });

  // Pittura nascosta: la pennellata arriva coperta di nebbia; un solo annulla toglie entrambe.
  await panel.getByRole("button", { name: "Pennello" }).click();
  await panel.getByLabel("Sotto la nebbia").check();
  await drag(gm, [120, 470], [420, 470]);
  await expect(board(player)).toHaveAttribute("data-terrain-count", "4");
  await expect(board(player)).toHaveAttribute("data-fog-count", "1");
  await gm.keyboard.press("Control+z");
  await expect(board(player)).toHaveAttribute("data-terrain-count", "3");
  await expect(board(player)).toHaveAttribute("data-fog-count", "0");
  expect(await terrainCount(gm)).toBe(3);
});

test("stamps: click to place, drag to scatter in one undo step, GM only", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  await expect(player.getByRole("button", { name: "Timbri" })).toHaveCount(0);

  await gm.keyboard.press("s");
  const panel = gm.getByRole("toolbar", { name: "Timbri" });
  await gm.keyboard.press("2");
  await expect(panel.getByRole("button", { name: "Pino" })).toHaveAttribute("aria-pressed", "true");
  await click(gm, 300, 300);
  await expect(board(player)).toHaveAttribute("data-item-count", "1");

  await panel.getByRole("button", { name: "Albero" }).click();
  await drag(gm, [400, 200], [900, 600]);
  const scattered = Number(await board(player).getAttribute("data-item-count"));
  expect(scattered).toBeGreaterThan(3);
  await gm.screenshot({ path: "e2e/.data/stamps-gm.png" });
  await gm.keyboard.press("Control+z");
  await expect(board(player)).toHaveAttribute("data-item-count", "1");

  // Il giocatore non può spostarli né cancellarli (livello mappa).
  await player.keyboard.press("e");
  await drag(player, [290, 290], [310, 310]);
  await expect(board(gm)).toHaveAttribute("data-item-count", "1");
});
