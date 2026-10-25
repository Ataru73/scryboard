import { expect, type Page, test } from "@playwright/test";
import { board, click, setupTable } from "./helpers";

async function wallPoints(page: Page, selector: string) {
  return page.evaluate((name) => {
    const { Konva } = window as unknown as {
      Konva: { stages: { find: (s: string) => { points: () => number[] }[] }[] };
    };
    return (Konva.stages[0]?.find(name) ?? []).map((node) => node.points());
  }, selector);
}

test("one-way walls point to the see-through side and can be reversed", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  await gm.keyboard.press("w");
  await gm.getByRole("button", { name: "Senso unico" }).click();
  await expect(gm.getByText(/si vede attraverso solo nel verso delle frecce/)).toBeVisible();
  await click(gm, 200, 300);
  await click(gm, 400, 300);
  await gm.keyboard.press("Enter");
  await expect(board(player)).toHaveAttribute("data-wall-count", "1");
  await expect.poll(() => wallPoints(gm, ".wall-one-way")).toEqual([[200, 300, 400, 300]]);

  await gm.keyboard.press("v");
  await click(gm, 300, 300);
  const panel = gm.getByRole("toolbar", { name: "Muro selezionato" });
  await expect(panel.getByText("Senso unico")).toBeVisible();
  await panel.getByRole("button", { name: "Inverti il verso" }).click();
  await expect.poll(() => wallPoints(gm, ".wall-one-way")).toEqual([[400, 300, 200, 300]]);
  // Annullare ripristina il verso: è un'azione sola.
  await gm.keyboard.press("Control+z");
  await expect.poll(() => wallPoints(gm, ".wall-one-way")).toEqual([[200, 300, 400, 300]]);
});

test("terrain walls are drawn as a distinct wall kind", async ({ browser }) => {
  const { gm } = await setupTable(browser);
  await gm.keyboard.press("w");
  await gm
    .getByRole("toolbar", { name: "Muri", exact: true })
    .getByRole("button", { name: "Terreno" })
    .click();
  await expect(gm.getByText(/il secondo muro ferma la vista/)).toBeVisible();
  for (const [x, y] of [
    [300, 200],
    [360, 200],
    [360, 260],
    [300, 260],
    [300, 200],
  ] as const) {
    await click(gm, x, y);
  }
  await gm.keyboard.press("Enter");
  await expect.poll(async () => (await wallPoints(gm, ".wall-terrain")).length).toBe(1);
});
