import { expect, type Page, test } from "@playwright/test";
import { board, setupTable } from "./helpers";

/** Un breve WebM generato nel browser: un quadrato che cambia colore. */
async function makeWebm(page: Page) {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const recorder = new MediaRecorder(canvas.captureStream(15), { mimeType: "video/webm" });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise((resolve) => {
      recorder.onstop = resolve;
    });
    recorder.start();
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = `hsl(${i * 18}, 80%, 50%)`;
      ctx.fillRect(0, 0, 160, 90);
      await new Promise((r) => setTimeout(r, 70));
    }
    recorder.stop();
    await stopped;
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  });
  return { name: "mappa.webm", mimeType: "video/webm", buffer: Buffer.from(base64, "base64") };
}

/** Lo stato dei <video> che la lavagna sta disegnando. */
async function videoState(page: Page) {
  return page.evaluate(() => {
    const { Konva } = window as unknown as {
      Konva: { stages: { find: (s: string) => { image: () => unknown }[] }[] };
    };
    const videos = (Konva.stages[0]?.find("Image") ?? [])
      .map((node) => node.image())
      .filter((image): image is HTMLVideoElement => image instanceof HTMLVideoElement);
    return videos.map((v) => ({
      paused: v.paused,
      muted: v.muted,
      loop: v.loop,
      readyState: v.readyState,
      time: v.currentTime,
    }));
  });
}

test("the GM uses a video as an animated map; players see it playing in a loop", async ({
  browser,
  browserName,
}) => {
  // Il WebKit di Playwright non registra né riproduce WebM come Chromium e Firefox.
  test.skip(browserName === "webkit", "WebM non è supportato dal WebKit di Playwright");
  const { gm, player } = await setupTable(browser);
  await gm
    .locator("input[type=file]")
    .first()
    .setInputFiles(await makeWebm(gm));
  await expect(board(gm)).toHaveAttribute("data-item-count", "1");
  await expect(board(player)).toHaveAttribute("data-item-count", "1");

  for (const page of [gm, player]) {
    await expect
      .poll(async () => (await videoState(page))[0]?.readyState)
      .toBeGreaterThanOrEqual(2);
    const first = (await videoState(page))[0];
    expect(first).toMatchObject({ muted: true, loop: true, paused: false });
    // Il tempo avanza: il video sta davvero girando.
    await expect.poll(async () => (await videoState(page))[0]?.time).not.toBe(first?.time);
  }
});

test("players cannot use videos as maps", async ({ browser }) => {
  const { player } = await setupTable(browser);
  await player
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "falso.webm",
      mimeType: "video/webm",
      buffer: Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]),
    });
  await expect(player.getByText("Solo il GM può usare i video come mappa")).toBeVisible();
  await expect(board(player)).toHaveAttribute("data-item-count", "0");
});
