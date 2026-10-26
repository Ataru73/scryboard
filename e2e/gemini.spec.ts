import { expect, type Page, test } from "@playwright/test";
import { board, click, openToolGroup, setupTable } from "./helpers";

const KEY = "AIza-clave-di-prova";
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const GEMINI = "https://generativelanguage.googleapis.com/**";

const modelsReply = {
  models: [
    {
      name: "models/gemini-3.1-flash",
      displayName: "Gemini Flash",
      supportedGenerationMethods: ["generateContent"],
    },
    {
      name: "models/gemini-3.1-flash-image",
      displayName: "Nano Banana 2",
      supportedGenerationMethods: ["generateContent"],
    },
    {
      name: "models/gemini-nano-banana-2.1",
      displayName: "Nano Banana 2.1",
      supportedGenerationMethods: ["generateContent"],
    },
    {
      name: "models/imagen-4.0-generate",
      displayName: "Imagen 4",
      supportedGenerationMethods: ["predict"],
    },
  ],
};

const imageReply = {
  candidates: [
    {
      finishReason: "STOP",
      content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG } }] },
    },
  ],
};

/** L'API di Gemini è sempre simulata: nessuna chiamata reale e nessuna chiave nella CI. */
async function mockGemini(page: Page, reply: { status: number; body: unknown } | null = null) {
  const calls: { method: string; url: string; key: string | undefined; body: string | null }[] = [];
  await page.route(GEMINI, async (route) => {
    const req = route.request();
    calls.push({
      method: req.method(),
      url: req.url(),
      key: req.headers()["x-goog-api-key"],
      body: req.postData(),
    });
    const { status, body } = reply ?? {
      status: 200,
      body: req.method() === "POST" ? imageReply : modelsReply,
    };
    await route.fulfill({
      status,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" },
      body: JSON.stringify(body),
    });
  });
  return calls;
}

async function saveKey(page: Page, key = KEY) {
  await page.getByRole("button", { name: "Impostazioni" }).click();
  await page.getByLabel("Chiave API di Gemini").fill(key);
  await page.getByRole("button", { name: "Salva" }).click();
}

const library = (page: Page) => page.getByRole("dialog", { name: "Libreria di immagini" });

async function openLibrary(page: Page) {
  await page.keyboard.press("k");
  await page.getByRole("button", { name: "Libreria", exact: true }).click();
  return library(page);
}

test("without a key the library has no Genera tab", async ({ browser }) => {
  const { gm } = await setupTable(browser);
  const dialog = await openLibrary(gm);
  await expect(dialog.getByRole("button", { name: "Genera" })).toHaveCount(0);
});

test("the key can be tested, saved and forgotten", async ({ browser }) => {
  const { gm } = await setupTable(browser);
  const calls = await mockGemini(gm);
  await gm.getByRole("button", { name: "Impostazioni" }).click();
  await gm.getByLabel("Chiave API di Gemini").fill(KEY);
  await gm.getByRole("button", { name: "Prova chiave" }).click();
  await expect(gm.getByText("Chiave valida: 2 modelli per immagini.")).toBeVisible();
  // La prova scarica l'elenco dei modelli: non è una generazione.
  expect(calls.map((c) => c.method)).toEqual(["GET"]);
  expect(calls[0]?.key).toBe(KEY);

  // Nel menu ci sono solo i modelli che generano immagini.
  const select = gm.getByLabel("Modello");
  await expect(select.getByRole("option")).toHaveText([
    /Predefinito/,
    "Nano Banana 2 (gemini-3.1-flash-image)",
    "Nano Banana 2.1 (gemini-nano-banana-2.1)",
  ]);
  await select.selectOption("gemini-nano-banana-2.1");
  // Anche il modello che legge le mappe è una tendina, con i soli modelli di testo.
  const vision = gm.getByLabel("Per leggere le mappe");
  await expect(vision.getByRole("option")).toHaveText([
    /Automatico \(gemini-3.1-flash\)/,
    "Gemini Flash (gemini-3.1-flash)",
  ]);
  await vision.selectOption("gemini-3.1-flash");
  await gm.getByRole("button", { name: "Salva" }).click();

  // Alla riapertura l'elenco si scarica da solo e il modello scelto resta selezionato.
  await gm.getByRole("button", { name: "Impostazioni" }).click();
  await expect(gm.getByLabel("Modello")).toHaveValue("gemini-nano-banana-2.1");
  await expect.poll(() => calls.map((c) => c.method)).toEqual(["GET", "GET"]);
  await gm.getByRole("button", { name: "Salva" }).click();

  const dialog = await openLibrary(gm);
  await dialog.getByRole("button", { name: "Genera" }).click();
  await dialog.getByLabel("Descrizione").fill("un lupo");
  await dialog.getByRole("button", { name: "Genera", exact: true }).last().click();
  await expect(dialog.getByRole("button", { name: /Usa la variante/ })).toHaveCount(2);
  // La generazione usa il modello scelto nel menu.
  expect(
    calls
      .filter((c) => c.method === "POST")
      .every((c) => c.url.includes("gemini-nano-banana-2.1:generateContent")),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Chiudi" }).click();

  await gm.getByRole("button", { name: "Impostazioni" }).click();
  await gm.getByRole("button", { name: "Dimentica chiave" }).click();
  await gm.getByRole("button", { name: "Salva" }).click();
  await gm.keyboard.press("k");
  await gm.getByRole("button", { name: "Libreria", exact: true }).click();
  await expect(library(gm).getByRole("button", { name: "Genera" })).toHaveCount(0);
});

test("a wrong key is reported", async ({ browser }) => {
  const { gm } = await setupTable(browser);
  await mockGemini(gm, {
    status: 400,
    body: { error: { message: "API key not valid. Please pass a valid API key." } },
  });
  await gm.getByRole("button", { name: "Impostazioni" }).click();
  await gm.getByLabel("Chiave API di Gemini").fill("sbagliata");
  await gm.getByRole("button", { name: "Prova chiave" }).click();
  await expect(gm.getByText("Chiave API non valida.")).toBeVisible();
});

test("a player generates a token image and it becomes the token's image", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  const calls = await mockGemini(player);
  const leaks: string[] = [];
  player.on("request", (req) => {
    const appRequest = new URL(req.url()).hostname === "127.0.0.1";
    const text = `${req.url()} ${req.postData() ?? ""} ${JSON.stringify(req.headers())}`;
    if (appRequest && text.includes(KEY)) leaks.push(req.url());
  });
  await saveKey(player);

  await player.keyboard.press("k");
  await player.getByLabel("Nome del token").fill("Goblin arciere");
  await player.getByRole("button", { name: "Libreria", exact: true }).click();
  const dialog = library(player);
  await dialog.getByRole("button", { name: "Genera" }).click();
  // La descrizione parte dal nome del token.
  await expect(dialog.getByLabel("Descrizione")).toHaveValue("Goblin arciere");
  await dialog.getByLabel("Descrizione").fill("goblin con l'arco e il cappuccio verde");
  await dialog.getByRole("button", { name: "Genera", exact: true }).last().click();
  await expect(dialog.getByRole("button", { name: /Usa la variante/ })).toHaveCount(2);
  const posts = calls.filter((c) => c.method === "POST");
  expect(posts).toHaveLength(2);
  expect(posts.every((c) => c.key === KEY && !c.url.includes(KEY))).toBe(true);

  await dialog.getByRole("button", { name: "Usa la variante 1" }).click();
  await expect(dialog).toBeHidden();
  // L'immagine è un asset della stanza: il token ora ha "Togli immagine".
  await expect(player.getByRole("button", { name: "Togli immagine" })).toBeVisible();
  await click(player, 300, 300);
  await expect(board(gm)).toHaveAttribute("data-item-count", "1");

  // Resta nella cronologia della stanza e si riusa senza rigenerare.
  await player.getByRole("button", { name: "Togli immagine" }).click();
  await player.getByRole("button", { name: "Libreria", exact: true }).click();
  await library(player).getByRole("button", { name: "Genera" }).click();
  await expect(
    library(player).getByRole("button", { name: "Riusa un'immagine generata" }),
  ).toHaveCount(1);
  await library(player).getByRole("button", { name: "Riusa un'immagine generata" }).click();
  await expect(player.getByRole("button", { name: "Togli immagine" })).toBeVisible();
  expect(calls.filter((c) => c.method === "POST")).toHaveLength(2);
  expect(leaks).toEqual([]);
});

test("Gemini refusals and quota errors are shown clearly", async ({ browser }) => {
  const { gm } = await setupTable(browser);
  await saveKey(gm);
  for (const [reply, message] of [
    [{ status: 200, body: { promptFeedback: { blockReason: "PROHIBITED_CONTENT" } } }, /rifiutato/],
    [
      { status: 429, body: { error: { status: "RESOURCE_EXHAUSTED" } } },
      /Quota di Gemini esaurita/,
    ],
  ] as const) {
    await gm.unroute(GEMINI);
    await mockGemini(gm, reply);
    const dialog = await openLibrary(gm);
    await dialog.getByRole("button", { name: "Genera" }).click();
    await dialog.getByLabel("Descrizione").fill("un mostro");
    await dialog.getByRole("button", { name: "Genera", exact: true }).last().click();
    await expect(dialog.getByText(message)).toBeVisible();
    await dialog.getByRole("button", { name: "Chiudi" }).click();
    await gm.keyboard.press("Escape");
  }
});

test("the GM generates a map from a description and it lands on the board as a map image", async ({
  browser,
}) => {
  const { gm, player } = await setupTable(browser);
  // Senza chiave il pulsante non c'è, neanche per il GM.
  const generate = gm.getByRole("button", { name: "Genera mappa" });
  await openToolGroup(gm, "Mappa");
  await expect(generate).toHaveCount(0);
  await gm.keyboard.press("Escape");
  const calls = await mockGemini(gm);
  await saveKey(gm);
  await openToolGroup(gm, "Mappa");
  await expect(generate).toBeVisible();
  // I giocatori non generano mappe.
  await expect(player.getByRole("button", { name: "Genera mappa" })).toHaveCount(0);

  await generate.click();
  const dialog = gm.getByRole("dialog", { name: "Genera una mappa" });
  await dialog.getByLabel("Descrizione").fill("cripta con un altare");
  await dialog.getByLabel("Formato").selectOption("4:3");
  await dialog.getByRole("button", { name: "Genera", exact: true }).click();
  await expect(dialog.getByRole("button", { name: /Usa la mappa/ })).toHaveCount(2);

  const requests = calls.filter((c) => c.method === "POST");
  expect(requests).toHaveLength(2);
  const sent = JSON.parse(requests[0]?.body ?? "{}");
  expect(sent.generationConfig.imageConfig.aspectRatio).toBe("4:3");
  expect(sent.contents[0].parts[0].text).toContain("cripta con un altare");
  const upload = gm.waitForResponse(
    (r) => r.url().includes("/assets") && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Usa la mappa 1" }).click();
  expect((await upload).ok()).toBe(true);
  await expect(dialog).toHaveCount(0);
  await expect(board(gm)).toHaveAttribute("data-item-count", "1");
  await expect(board(player)).toHaveAttribute("data-item-count", "1");
});

test("the GM has Gemini trace the walls of the map, in one undo step", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  const trace = {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                walls: [
                  {
                    kind: "wall",
                    points: [
                      { x: 100, y: 100 },
                      { x: 900, y: 100 },
                      { x: 900, y: 900 },
                    ],
                  },
                  {
                    kind: "door",
                    points: [
                      { x: 400, y: 900 },
                      { x: 500, y: 900 },
                    ],
                  },
                ],
              }),
            },
          ],
        },
      },
    ],
  };
  const calls = await mockGemini(gm, { status: 200, body: trace });
  await saveKey(gm);

  const png = await gm.evaluate(async () => {
    const canvas = new OffscreenCanvas(400, 200);
    (canvas.getContext("2d") as OffscreenCanvasRenderingContext2D).fillRect(0, 0, 400, 200);
    const bytes = new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer());
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  });
  await gm.locator('input[type="file"]').setInputFiles({
    name: "mappa.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(board(gm)).toHaveAttribute("data-item-count", "1");

  // Senza chiave il pulsante non c'è; i giocatori non hanno lo strumento.
  await expect(player.getByRole("button", { name: "Traccia muri con Gemini" })).toHaveCount(0);
  await gm.keyboard.press("w");
  await gm.getByRole("button", { name: "Traccia muri con Gemini" }).click();
  await expect(board(gm)).toHaveAttribute("data-wall-count", "2");
  await expect(board(player)).toHaveAttribute("data-wall-count", "2");

  // Questa risposta simulata non contiene l'elenco dei modelli: si usa il modello di riserva.
  const request = calls.find((c) => c.method === "POST");
  const sent = JSON.parse(request?.body ?? "{}");
  expect(request?.url).toContain("/models/gemini-2.5-flash:generateContent");
  expect(sent.contents[0].parts[0].inlineData.mimeType).toBe("image/jpeg");
  expect(sent.generationConfig.responseMimeType).toBe("application/json");

  await gm.keyboard.press("Control+z");
  await expect(board(gm)).toHaveAttribute("data-wall-count", "0");
});

test("if Gemini cannot find the model the tracing stops with a message and can be retried", async ({
  browser,
}) => {
  const { gm } = await setupTable(browser);
  await mockGemini(gm, {
    status: 404,
    body: { error: { message: "models/x is not found", status: "NOT_FOUND" } },
  });
  await saveKey(gm);
  const png = await gm.evaluate(async () => {
    const canvas = new OffscreenCanvas(400, 200);
    (canvas.getContext("2d") as OffscreenCanvasRenderingContext2D).fillRect(0, 0, 400, 200);
    const bytes = new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer());
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  });
  await gm.locator('input[type="file"]').setInputFiles({
    name: "mappa.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(board(gm)).toHaveAttribute("data-item-count", "1");
  await gm.keyboard.press("w");
  const button = gm.getByRole("button", { name: "Traccia muri con Gemini" });
  await button.click();
  await expect(gm.getByText("Modello non trovato")).toBeVisible();
  await expect(button).toBeEnabled();
});
