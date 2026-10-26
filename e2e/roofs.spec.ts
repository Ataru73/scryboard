import { expect, type Page, test } from "@playwright/test";
import { board, click, drag, placeToken, setupTable } from "./helpers";

/** Opacità del nodo del tetto (l'unico oggetto disegnato con un riempimento a texture). */
async function roofOpacity(page: Page) {
  return page.evaluate(() => {
    type Node = { opacity: () => number; findOne: (s: string) => unknown };
    const { Konva } = window as unknown as { Konva: { stages: { find: (s: string) => Node[] }[] } };
    const roof = Konva.stages[0]
      ?.find(".item")
      .find((node) =>
        (
          node.findOne("Line") as { fillPatternImage?: () => unknown } | undefined
        )?.fillPatternImage?.(),
      );
    return roof?.opacity() ?? null;
  });
}

test("a procedural roof covers the building and fades when a token walks in", async ({
  browser,
}) => {
  const { gm, player } = await setupTable(browser);
  await gm.keyboard.press("u");
  await gm.getByRole("toolbar", { name: "Tetti" }).getByRole("button", { name: "Paglia" }).click();
  await click(gm, 300, 200);
  await click(gm, 500, 200);
  await click(gm, 500, 400);
  await click(gm, 300, 400);
  await gm.keyboard.press("Enter");
  await expect(board(player)).toHaveAttribute("data-item-count", "1");

  // Da fuori il tetto copre l'interno; il GM lo vede in trasparenza.
  await expect.poll(() => roofOpacity(player)).toBe(1);
  await expect.poll(() => roofOpacity(gm)).toBeCloseTo(0.55, 2);
  // Nell'anteprima «Vista» il GM lo vede come il giocatore.
  await gm.keyboard.press("i");
  await gm.getByLabel("Vista", { exact: true }).selectOption({ label: "Arwen" });
  await expect.poll(() => roofOpacity(gm)).toBe(1);
  await gm.getByLabel("Vista", { exact: true }).selectOption({ index: 0 });
  await expect.poll(() => roofOpacity(gm)).toBeCloseTo(0.55, 2);

  await placeToken(gm, "Arwen", 120, 120);
  await expect(board(player)).toHaveAttribute("data-item-count", "2");
  await expect.poll(() => roofOpacity(player)).toBe(1);

  // Il token entra: il tetto svanisce per tutti; esce e torna.
  await gm.keyboard.press("v");
  await drag(gm, [120, 120], [400, 300]);
  await expect.poll(() => roofOpacity(player)).toBeCloseTo(0.15, 2);
  await expect.poll(() => roofOpacity(gm)).toBeCloseTo(0.15, 2);
  await drag(gm, [400, 300], [120, 120]);
  await expect.poll(() => roofOpacity(player)).toBe(1);
});
