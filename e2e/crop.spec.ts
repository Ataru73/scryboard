import { expect, type Page, type Response, test } from "@playwright/test";
import { setupTable } from "./helpers";

/** 400×200: metà sinistra rossa, metà destra blu. Il quadrato centrale è metà rosso, metà blu. */
async function twoToneImage(page: Page) {
  const base64 = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(400, 200);
    const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = "#0000ff";
    ctx.fillRect(200, 0, 200, 200);
    const bytes = new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer());
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  });
  return { name: "due.png", mimeType: "image/png", buffer: Buffer.from(base64, "base64") };
}

/** Dimensioni e colori (sinistra, destra) dell'asset appena caricato, riletto dal server. */
async function inspectUpload(page: Page, roomId: string, response: Response) {
  const { assetId } = (await response.json()) as { assetId: string };
  // Il GM legge gli asset col suo token, come fa l'app.
  const gmLink = await page.getByLabel("Link GM (tienilo segreto)").inputValue();
  const token = new URLSearchParams(new URL(gmLink).hash.slice(1)).get("gm") as string;
  return page.evaluate(
    async ([room, asset, gm]) => {
      const res = await fetch(`/api/rooms/${room}/assets/${asset}`, {
        headers: { authorization: `Bearer ${gm}` },
      });
      if (!res.ok) throw new Error(`asset ${res.status}`);
      const bitmap = await createImageBitmap(await res.blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
      ctx.drawImage(bitmap, 0, 0);
      const px = (x: number) => Array.from(ctx.getImageData(x, 256, 1, 1).data.slice(0, 3));
      return {
        width: bitmap.width,
        height: bitmap.height,
        type: res.headers.get("content-type"),
        left: px(60),
        right: px(450),
      };
    },
    [roomId, assetId, token] as const,
  );
}

const uploaded = (page: Page) =>
  page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/assets"));

async function pickFile(page: Page) {
  await page.keyboard.press("k");
  await page.getByLabel("Immagine del token").setInputFiles(await twoToneImage(page));
  const dialog = page.getByRole("dialog", { name: "Ritaglia l'immagine" });
  await expect(dialog).toBeVisible();
  // Aspetta che l'immagine sia decodificata: il pulsante si abilita.
  await expect(dialog.getByRole("button", { name: "Usa questa immagine" })).toBeEnabled();
  return dialog;
}

const isRed = (rgb: number[]) => (rgb[0] ?? 0) > 200 && (rgb[2] ?? 255) < 60;
const isBlue = (rgb: number[]) => (rgb[2] ?? 0) > 200 && (rgb[0] ?? 255) < 60;

test("a custom token image is cropped to a 512×512 square before upload", async ({ browser }) => {
  const { gm, roomId } = await setupTable(browser);
  const dialog = await pickFile(gm);
  const upload = uploaded(gm);
  await dialog.getByRole("button", { name: "Usa questa immagine" }).click();
  const sent = await inspectUpload(gm, roomId, await upload);
  expect(sent.type).toBe("image/webp");
  expect(sent.width).toBe(512);
  expect(sent.height).toBe(512);
  // Senza ritocchi si tiene il quadrato centrale: metà rossa e metà blu.
  expect(isRed(sent.left)).toBe(true);
  expect(isBlue(sent.right)).toBe(true);
  await expect(gm.getByRole("button", { name: "Togli immagine" })).toBeVisible();
});

test("dragging the image in the editor selects another area", async ({ browser }) => {
  const { gm, roomId } = await setupTable(browser);
  const dialog = await pickFile(gm);
  // Con il quadrato centrale a zoom 1 si può solo scorrere in orizzontale: si porta a destra.
  const canvas = dialog.getByLabel(/Area del token/);
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas not visible");
  await gm.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await gm.mouse.down();
  await gm.mouse.move(box.x + box.width / 2 - 200, box.y + box.height / 2, { steps: 6 });
  await gm.mouse.up();
  const upload = uploaded(gm);
  await dialog.getByRole("button", { name: "Usa questa immagine" }).click();
  const sent = await inspectUpload(gm, roomId, await upload);
  // Ora l'area è tutta nella metà destra dell'immagine.
  expect(isBlue(sent.left)).toBe(true);
  expect(isBlue(sent.right)).toBe(true);
});

test("cancelling the editor uploads nothing", async ({ browser }) => {
  const { gm } = await setupTable(browser);
  const dialog = await pickFile(gm);
  const requests: string[] = [];
  gm.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/assets")) requests.push(r.url());
  });
  await dialog.getByLabel("Zoom").fill("3");
  await dialog.getByRole("button", { name: "Annulla" }).click();
  await expect(dialog).toBeHidden();
  await expect(gm.getByRole("button", { name: "Togli immagine" })).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("unsupported files are rejected before the editor opens", async ({ browser }) => {
  const { gm } = await setupTable(browser);
  await gm.keyboard.press("k");
  await gm
    .getByLabel("Immagine del token")
    .setInputFiles({ name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("ciao") });
  await expect(gm.getByText(/formato non supportato/)).toBeVisible();
  await expect(gm.getByRole("dialog", { name: "Ritaglia l'immagine" })).toHaveCount(0);
});
