import { HocuspocusProvider } from "@hocuspocus/provider";
import { expect, type Page, test } from "@playwright/test";
import * as Y from "yjs";
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

// Criterio della F1: una mappa di 60×40 caselle dipinta con 2.000 pennellate resta fluida.
test("@perf panning a map painted with 2,000 strokes stays fluid", async ({ browser }) => {
  test.setTimeout(180_000);
  const { gm } = await setupTable(browser);
  const gmLink = await gm.getByLabel("Link GM (tienilo segreto)").inputValue();
  const url = new URL(gmLink);
  const roomId = url.pathname.split("/").pop() as string;
  const token = new URLSearchParams(url.hash.slice(1)).get("gm") as string;

  // Un client Yjs nel processo dei test dipinge 2.000 pennellate come farebbe il GM.
  const doc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: `ws://${url.host}/collab`,
    name: `room:${roomId}:public`,
    document: doc,
    token,
  });
  await new Promise<void>((resolve) => provider.on("synced", () => resolve()));
  const biomes = ["grass", "forest", "rock", "sand", "shallow-water", "dry-grass", "mud"];
  const cell = 70;
  doc.transact(() => {
    for (let i = 0; i < 2000; i++) {
      const x = (i * 7919) % (60 * cell);
      const y = (i * 104729) % (40 * cell);
      const points = [x, y, x + 60, y + 20, x + 120, y - 10, x + 180, y + 30];
      doc.getMap("terrain").set(`op${i}`, {
        id: `op${i}`,
        seq: i,
        biome: biomes[i % biomes.length],
        mode: "paint",
        shape: "brush",
        points,
        width: cell * (1 + (i % 3)),
      });
    }
  });
  // Registra i blocchi del thread principale (long task) durante il primo disegno.
  await gm.evaluate(() => {
    const w = window as unknown as { __longest: number };
    w.__longest = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__longest = Math.max(w.__longest, e.duration);
    }).observe({ type: "longtask", buffered: true });
  });
  await expect(board(gm)).toHaveAttribute("data-terrain-count", "2000", { timeout: 30_000 });
  provider.destroy();

  await gm.keyboard.press("Shift+1"); // tutta la mappa
  const t0 = Date.now();
  await expect
    .poll(
      () =>
        gm.evaluate(() => {
          const { Konva } = window as unknown as {
            Konva: { stages: { find: (s: string) => unknown[] }[] };
          };
          return Konva.stages[0]?.find(".terrain-pending").length ?? 0;
        }),
      { timeout: 60_000, intervals: [50] },
    )
    .toBe(0);
  console.log(`terreno completo (mappa intera) in ${Date.now() - t0} ms`);
  await gm.screenshot({ path: "e2e/.data/terrain-2000.png" });
  const fpsFit = await measurePan(gm, "terreno, mappa intera");
  await gm.keyboard.press("Shift+0"); // zoom 100%
  const fps100 = await measurePan(gm, "terreno, zoom 100%");
  const longest = await gm.evaluate(() => (window as unknown as { __longest: number }).__longest);
  console.log(`blocco più lungo del thread principale: ${longest.toFixed(0)} ms`);
  expect(Math.min(fpsFit, fps100)).toBeGreaterThan(20);
});

async function measurePan(gm: Page, label: string) {
  await gm.keyboard.press("h");
  await gm.waitForTimeout(500); // primo disegno dei tasselli
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
  const p = await at(gm, 400, 350);
  await gm.mouse.move(p.x, p.y);
  await gm.mouse.down();
  for (let i = 0; i < 180; i++) {
    await gm.mouse.move(p.x + Math.sin(i / 10) * 300, p.y + Math.cos(i / 10) * 200);
  }
  await gm.mouse.up();
  const seconds = (Date.now() - start) / 1000;
  const frames = await gm.evaluate(() => {
    const w = window as unknown as { __frames: number; __counting: boolean };
    w.__counting = false;
    return w.__frames;
  });
  const fps = frames / seconds;
  console.log(`pan (${label}): ${fps.toFixed(1)} fps`);
  return fps;
}
