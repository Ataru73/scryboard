import { expect, type Page, test } from "@playwright/test";
import { click, drag, placeToken, setupTable, tokenList } from "./helpers";

function nodes(page: Page, selector: string) {
  return page.evaluate((sel) => {
    type Node = { x: () => number; y: () => number; points?: () => number[] };
    const { Konva } = window as unknown as { Konva: { stages: { find: (s: string) => Node[] }[] } };
    return (Konva.stages[0]?.find(sel) ?? []).map((n) => ({
      x: n.x(),
      y: n.y(),
      points: n.points?.() ?? [],
    }));
  }, selector);
}

test("the GM switches to a hex grid: tokens snap to hex centres, walls to hex corners", async ({
  browser,
}) => {
  const { gm, player } = await setupTable(browser);
  await gm.getByRole("button", { name: "Griglia", exact: true }).click();
  await gm.getByLabel("Mostra la griglia").check();
  await gm.getByLabel("Tipo").selectOption({ label: "Esagonale a punta" });
  await gm.getByRole("button", { name: "Chiudi" }).click();

  // Esagoni a punta da 70 px con centro di riferimento in (0, 0): l'esagono (q 1, r 4) ha il
  // centro in (210, 242,5), cioè colonna 4 e riga 5 nell'elenco.
  await placeToken(gm, "Elfo", 215, 245);
  await expect(tokenList(player).getByRole("listitem")).toHaveText(["Elfo, colonna 4, riga 5"]);
  const [token] = await nodes(gm, ".item");
  expect(token?.x).toBeCloseTo(210, 0);
  expect(token?.y).toBeCloseTo(242.5, 0);

  // Trascinato di poco più di un esagono a destra, si aggancia al centro successivo.
  await gm.keyboard.press("v");
  await drag(gm, [210, 242], [285, 246]);
  await expect(tokenList(player).getByRole("listitem")).toHaveText(["Elfo, colonna 5, riga 5"]);
  const [moved] = await nodes(gm, ".item");
  expect(moved?.x).toBeCloseTo(280, 0);

  // I muri si agganciano ai vertici degli esagoni.
  await gm.keyboard.press("w");
  await click(gm, 247, 224);
  await click(gm, 246, 264);
  await gm.keyboard.press("Enter");
  await expect
    .poll(async () => (await nodes(gm, ".wall-line"))[0]?.points.map(Math.round))
    .toEqual([245, 222, 245, 263]);
  await gm.screenshot({ path: "e2e/.data/hexgrid-gm.png" });
});

test("calibrating a hex grid uses the box around one hex", async ({ browser }) => {
  const { gm } = await setupTable(browser);
  await gm.getByRole("button", { name: "Griglia", exact: true }).click();
  await gm.getByLabel("Mostra la griglia").check();
  await gm.getByLabel("Tipo").selectOption({ label: "Esagonale piatta" });
  await gm.getByRole("button", { name: "Calibra sulla mappa" }).click();
  // Esagono piatto da 50: alto 50, largo 50 · 2/√3 ≈ 57,7.
  await drag(gm, [300, 300], [358, 350]);
  const size = Number(await gm.getByLabel("Casella (px)").inputValue());
  expect(Math.abs(size - 50)).toBeLessThanOrEqual(1);
  await expect(gm.getByText(/Griglia calibrata/)).toBeVisible();
});
