import { expect, type Page, test } from "@playwright/test";
import { at, board, setupTable } from "./helpers";

/** Opacità della scia in un punto della lavagna (livello più alto dello stage, quello della scia). */
async function laserAlpha(page: Page, x: number, y: number) {
  return page.evaluate(
    ({ px, py }) => {
      type Layer = { getCanvas: () => { _canvas: HTMLCanvasElement; getPixelRatio: () => number } };
      const { Konva } = window as unknown as { Konva: { stages: { getLayers: () => Layer[] }[] } };
      const layer = Konva.stages[0]?.getLayers().at(-1);
      if (!layer) return 0;
      const canvas = layer.getCanvas();
      const ratio = canvas.getPixelRatio();
      const ctx = canvas._canvas.getContext("2d");
      // Il massimo in un piccolo intorno: la scia è sottile.
      const data = ctx?.getImageData(px * ratio - 4, py * ratio - 4, 9, 9).data ?? [];
      let max = 0;
      for (let i = 3; i < data.length; i += 4) max = Math.max(max, data[i] as number);
      return max;
    },
    { px: x, py: y },
  );
}

test("the laser pointer leaves a fading trail everyone sees and nothing on the board", async ({
  browser,
}) => {
  const { gm, player } = await setupTable(browser);
  await gm.keyboard.press("q");
  await expect(gm.getByRole("button", { name: "Puntatore laser" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const from = await at(gm, 300, 300);
  const to = await at(gm, 500, 300);
  await gm.mouse.move(from.x, from.y);
  await gm.mouse.down();
  await gm.mouse.move(to.x, to.y, { steps: 20 });

  await expect.poll(() => laserAlpha(player, 400, 300)).toBeGreaterThan(50);
  await gm.mouse.up();
  // La scia svanisce da sola in poco più di un secondo e non lascia oggetti.
  await expect.poll(() => laserAlpha(player, 400, 300), { timeout: 4000 }).toBe(0);
  await expect(board(player)).toHaveAttribute("data-item-count", "0");
  await expect(board(gm)).toHaveAttribute("data-item-count", "0");
});
