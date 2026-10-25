import { expect, type Page, test } from "@playwright/test";
import { board, click, setupTable } from "./helpers";

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
  await expect(gm.getByRole("button", { name: "Genera mappa" })).toHaveCount(0);
  const calls = await mockGemini(gm);
  await saveKey(gm);
  await expect(gm.getByRole("button", { name: "Genera mappa" })).toBeVisible();
  // I giocatori non generano mappe.
  await expect(player.getByRole("button", { name: "Genera mappa" })).toHaveCount(0);

  await gm.getByRole("button", { name: "Genera mappa" }).click();
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
