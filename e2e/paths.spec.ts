import { expect, type Page, test } from "@playwright/test";
import { at, board, click, drag, setupTable } from "./helpers";

function handles(page: Page) {
  return page.evaluate(() => {
    type Node = { x: () => number; y: () => number };
    const { Konva } = window as unknown as { Konva: { stages: { find: (s: string) => Node[] }[] } };
    return (Konva.stages[0]?.find(".path-handle") ?? []).map((n) => ({
      x: Math.round(n.x()),
      y: Math.round(n.y()),
    }));
  });
}

test("the GM draws and edits roads and rivers; players only see them", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  await expect(player.getByRole("button", { name: "Percorso" })).toHaveCount(0);

  // Un fiume a clic: tre punti e Invio.
  await gm.keyboard.press("j");
  const panel = gm.getByRole("toolbar", { name: "Percorso" });
  await panel.getByRole("button", { name: /Fiume/ }).click();
  await click(gm, 150, 200);
  await click(gm, 400, 300);
  await click(gm, 700, 220);
  await gm.keyboard.press("Enter");
  await expect(board(player)).toHaveAttribute("data-item-count", "1");

  // Una strada lastricata a mano libera.
  await panel.getByRole("button", { name: /Strada lastricata/ }).click();
  await drag(gm, [200, 500], [800, 560]);
  await expect(board(player)).toHaveAttribute("data-item-count", "2");

  // Il giocatore non può selezionarli né cancellarli.
  await click(player, 400, 300);
  await expect(player.getByRole("toolbar", { name: "Selezione" })).toHaveCount(0);
  await player.keyboard.press("e");
  await drag(player, [390, 290], [410, 310]);
  await expect(board(gm)).toHaveAttribute("data-item-count", "2");

  // Il GM seleziona il fiume: compaiono le maniglie dei tre punti.
  await gm.keyboard.press("v");
  await click(gm, 400, 300);
  await expect(gm.getByRole("toolbar", { name: "Selezione" })).toBeVisible();
  await expect
    .poll(() => handles(gm))
    .toEqual([
      { x: 150, y: 200 },
      { x: 400, y: 300 },
      { x: 700, y: 220 },
    ]);

  // Trascina il punto centrale più in basso.
  await drag(gm, [400, 300], [420, 380]);
  await expect.poll(async () => (await handles(gm))[1]).toEqual({ x: 420, y: 380 });

  // Doppio clic sul fiume: un punto in più; poi lo si elimina dal pannello.
  const between = await at(gm, 285, 290);
  await gm.mouse.dblclick(between.x, between.y);
  await expect.poll(async () => (await handles(gm)).length).toBe(4);
  await gm.getByRole("button", { name: "Elimina punto" }).click();
  await expect.poll(async () => (await handles(gm)).length).toBe(3);

  // Larghezza e stile dal pannello.
  await gm.getByRole("button", { name: "Allarga" }).click();
  await gm.getByLabel("Stile del percorso").selectOption({ label: "Ruscello" });
  await gm.screenshot({ path: "e2e/.data/paths-gm.png" });
  await player.screenshot({ path: "e2e/.data/paths-player.png" });

  // Annulla l'ultimo cambio di stile.
  await gm.keyboard.press("Control+z");
  await expect(gm.getByLabel("Stile del percorso")).toHaveValue("river");
});
