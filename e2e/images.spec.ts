import { expect, type Page, test } from "@playwright/test";
import { at, board, setupTable } from "./helpers";

/** Immagine 300×200 generata nel browser, abbastanza grande da cliccarla. */
async function uploadImage(page: Page) {
  const base64 = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(300, 200);
    const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    ctx.fillStyle = "#cc3333";
    ctx.fillRect(0, 0, 300, 200);
    const bytes = new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer());
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  });
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({ name: "a.png", mimeType: "image/png", buffer: Buffer.from(base64, "base64") });
  await expect(board(page)).toHaveAttribute("data-item-count", "1");
}

const imageAndAnchor = (page: Page) =>
  page.evaluate(() => {
    const { Konva } = window as unknown as {
      Konva: {
        stages: {
          findOne: (f: (n: unknown) => boolean) => {
            getClientRect: () => { x: number; y: number; width: number; height: number };
          };
          find: (s: string) => {
            nodes: () => unknown[];
            findOne: (s: string) => { getAbsolutePosition: () => { x: number; y: number } };
          }[];
        }[];
      };
    };
    const stage = Konva.stages[0];
    const item = stage?.findOne((n) => (n as { hasName: (s: string) => boolean }).hasName("item"));
    const transformer = stage?.find("Transformer")[0];
    return {
      box: item?.getClientRect(),
      selected: transformer?.nodes().length ?? 0,
      anchor: transformer?.findOne(".bottom-right").getAbsolutePosition(),
    };
  });

test("dragging a corner anchor resizes the selected image instead of pinging", async ({
  browser,
}) => {
  const { gm } = await setupTable(browser);
  await uploadImage(gm);
  await expect.poll(async () => (await imageAndAnchor(gm)).box?.width).toBe(300);

  const start = (await imageAndAnchor(gm)).box;
  if (!start) throw new Error("image not found");
  const centre = await at(gm, start.x + start.width / 2, start.y + start.height / 2);
  await gm.mouse.click(centre.x, centre.y);
  await expect.poll(async () => (await imageAndAnchor(gm)).selected).toBe(1);

  const anchor = (await imageAndAnchor(gm)).anchor;
  if (!anchor) throw new Error("anchor not found");
  const from = await at(gm, anchor.x, anchor.y);
  await gm.mouse.move(from.x, from.y);
  await gm.mouse.down();
  await gm.mouse.move(from.x + 60, from.y + 40, { steps: 5 });
  // Più del tempo di pressione del ping: tenendo premuto non deve partire.
  await gm.waitForTimeout(700);
  await gm.mouse.up();

  const after = await imageAndAnchor(gm);
  expect(after.box?.width).toBeGreaterThan(300);
  expect(after.box?.height).toBeGreaterThan(200);
  // La selezione resta, così si può continuare a trasformare l'immagine.
  expect(after.selected).toBe(1);
});
