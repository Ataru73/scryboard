import { expect, test } from "@playwright/test";
import { at, board, setupTable } from "./helpers";

// Misura indicativa, esclusa dalla suite normale: `pnpm e2e:perf`. In Chromium headless il
// rendering è software, quindi su un browser vero con GPU i numeri sono migliori.
test("@perf panning an 8000×8000 map stays fluid", async ({ browser }) => {
  test.setTimeout(120_000);
  const { gm } = await setupTable(browser);

  // Genera nel browser una mappa 8000×8000 con un motivo a scacchiera.
  const base64 = await gm.evaluate(async () => {
    const canvas = new OffscreenCanvas(8000, 8000);
    const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    for (let y = 0; y < 8000; y += 200) {
      for (let x = 0; x < 8000; x += 200) {
        ctx.fillStyle = (x + y) % 400 === 0 ? "#7a6a52" : "#a8957a";
        ctx.fillRect(x, y, 200, 200);
      }
    }
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  });
  await gm
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "mappa.png",
      mimeType: "image/png",
      buffer: Buffer.from(base64, "base64"),
    });
  await expect(board(gm)).toHaveAttribute("data-item-count", "1");
  await gm.waitForTimeout(1500); // decodifica dell'immagine

  async function measure(label: string, zoomKey: string) {
    await gm.keyboard.press(zoomKey);
    await gm.keyboard.press("h");
    await gm.evaluate(() => {
      const w = window as unknown as { __frames: number; __counting: boolean };
      w.__frames = 0;
      w.__counting = true;
      const tick = () => {
        if (!w.__counting) return;
        w.__frames++;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const start = Date.now();
    const p = await at(gm, 300, 300);
    await gm.mouse.move(p.x, p.y);
    await gm.mouse.down();
    for (let i = 0; i < 180; i++) {
      await gm.mouse.move(p.x + Math.sin(i / 10) * 250, p.y + Math.cos(i / 10) * 150);
    }
    await gm.mouse.up();
    const seconds = (Date.now() - start) / 1000;
    const frames = await gm.evaluate(() => {
      const w = window as unknown as { __frames: number; __counting: boolean };
      w.__counting = false;
      return w.__frames;
    });
    const fps = frames / seconds;
    console.log(`pan su mappa 8000×8000 (${label}): ${fps.toFixed(1)} fps`);
    return fps;
  }

  // A zoom 100% (si vede una porzione) e con la mappa intera adattata allo schermo.
  const fps = Math.min(
    await measure("zoom 100%", "Shift+0"),
    await measure("mappa intera", "Shift+1"),
  );
  expect(fps).toBeGreaterThan(20);
});
