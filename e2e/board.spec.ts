import { type Browser, expect, type Page, test } from "@playwright/test";

async function joinAs(page: Page, name: string) {
  await page.getByLabel("Nome", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByText("Connesso")).toBeVisible();
}

async function createRoomAsGm(browser: Browser) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  await page.getByLabel("Nome della stanza").fill("La Miniera Perduta");
  await page.getByRole("button", { name: "Crea stanza come GM" }).click();
  await joinAs(page, "Master");
  const playerLink = await page.getByLabel("Link per i giocatori").inputValue();
  return { page, playerLink };
}

const board = (page: Page) => page.getByRole("application", { name: "Lavagna" });
const expectItems = (page: Page, count: number) =>
  expect(board(page)).toHaveAttribute("data-item-count", String(count));

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const box = await board(page).boundingBox();
  if (!box) throw new Error("board not visible");
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + (from[0] + to[0]) / 2, box.y + (from[1] + to[1]) / 2, { steps: 5 });
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 });
  await page.mouse.up();
}

test("GM and player draw together on a shared board", async ({ browser }) => {
  const gm = await createRoomAsGm(browser);
  await expectItems(gm.page, 0);

  const player = await (await browser.newContext()).newPage();
  await player.goto(gm.playerLink);
  await joinAs(player, "Arwen");
  // Nell'elenco "Al tavolo" (i nomi compaiono anche tra i destinatari dei messaggi).
  const atTable = (page: Page) => page.getByRole("complementary").getByRole("listitem");
  await expect(atTable(player).filter({ hasText: "Master" })).toBeVisible();
  await expect(atTable(gm.page).filter({ hasText: "Arwen" })).toBeVisible();

  // Il GM disegna un rettangolo, il giocatore lo vede.
  await gm.page.getByRole("button", { name: "Rettangolo" }).click();
  await drag(gm.page, [300, 200], [500, 320]);
  await expectItems(gm.page, 1);
  await expectItems(player, 1);

  // Il giocatore disegna a mano libera, il GM lo vede.
  await player.getByRole("button", { name: "Matita" }).click();
  await drag(player, [600, 400], [750, 480]);
  await expectItems(player, 2);
  await expectItems(gm.page, 2);

  // Il GM carica una mappa.
  const upload = gm.page.waitForResponse(
    (r) => r.url().includes("/assets") && r.request().method() === "POST",
  );
  await gm.page.locator("input[type=file]").setInputFiles("e2e/fixtures/map.png");
  expect((await upload).status()).toBe(201);
  await expectItems(gm.page, 3);
  await expectItems(player, 3);

  // Testo.
  await gm.page.getByRole("button", { name: "Testo" }).click();
  const box = await board(gm.page).boundingBox();
  if (!box) throw new Error("board not visible");
  await gm.page.mouse.click(box.x + 300, box.y + 500);
  await gm.page.getByRole("textbox", { name: "Modifica testo" }).fill("Qui c'è un drago");
  await gm.page.keyboard.press("Escape");
  await expectItems(gm.page, 4);
  await expectItems(player, 4);

  // Gomma: il GM cancella il tratto del giocatore; poi annulla.
  await gm.page.getByRole("button", { name: "Gomma" }).click();
  await drag(gm.page, [660, 380], [690, 470]);
  await expectItems(player, 3);
  await gm.page.keyboard.press("Control+z");
  await expectItems(player, 4);

  await gm.page.screenshot({ path: "e2e/.data/gm.png" });
  await player.screenshot({ path: "e2e/.data/player.png" });

  // Dopo un ricaricamento la board è ancora lì.
  await player.reload();
  await expectItems(player, 4);
});

test("players cannot move or erase the GM's map", async ({ browser }) => {
  const gm = await createRoomAsGm(browser);
  await gm.page.locator("input[type=file]").setInputFiles("e2e/fixtures/map.png");
  await expectItems(gm.page, 1);

  const player = await (await browser.newContext()).newPage();
  await player.goto(gm.playerLink);
  await joinAs(player, "Bilbo");
  await expectItems(player, 1);

  // La mappa è al centro della vista: la gomma non deve toccarla.
  await player.getByRole("button", { name: "Gomma" }).click();
  const box = await board(player).boundingBox();
  if (!box) throw new Error("board not visible");
  await drag(player, [box.width / 2 - 20, box.height / 2], [box.width / 2 + 20, box.height / 2]);
  await expectItems(gm.page, 1);
});

test("select, move and delete items with the keyboard", async ({ browser }) => {
  const gm = await createRoomAsGm(browser);
  await gm.page.getByRole("button", { name: "Rettangolo" }).click();
  await drag(gm.page, [300, 200], [500, 320]);
  await gm.page.getByRole("button", { name: "Ellisse" }).click();
  await drag(gm.page, [600, 200], [700, 300]);
  await expectItems(gm.page, 2);

  // Le forme vuote si selezionano dal bordo.
  await gm.page.keyboard.press("v");
  await drag(gm.page, [300, 260], [340, 300]);
  await gm.page.keyboard.press("Delete");
  await expectItems(gm.page, 1);
  await gm.page.keyboard.press("Control+z");
  await expectItems(gm.page, 2);

  // Lo spostamento è un'azione annullabile separata.
  await gm.page.keyboard.press("Control+z");
  await gm.page.keyboard.press("Control+z");
  await expectItems(gm.page, 1);
});

test("drawing on an empty board does not move the view", async ({ browser }) => {
  const gm = await createRoomAsGm(browser);
  await gm.page.getByRole("button", { name: "Rettangolo" }).click();
  await drag(gm.page, [300, 200], [500, 320]);
  await expectItems(gm.page, 1);
  await expect(gm.page.getByRole("button", { name: "Zoom al 100%" })).toHaveText("100%");
  // Il bordo del rettangolo è dove lo si è disegnato: la gomma lo trova lì.
  await gm.page.getByRole("button", { name: "Gomma" }).click();
  await drag(gm.page, [290, 260], [310, 260]);
  await expectItems(gm.page, 0);
});

test("zoom with the wheel and pan with the hand tool", async ({ browser }) => {
  const gm = await createRoomAsGm(browser);
  const zoom = gm.page.getByRole("button", { name: "Zoom al 100%" });
  const box = await board(gm.page).boundingBox();
  if (!box) throw new Error("board not visible");
  await gm.page.mouse.move(box.x + 400, box.y + 300);
  await gm.page.mouse.wheel(0, -400);
  await expect(zoom).not.toHaveText("100%");
  await gm.page.keyboard.press("Shift+0");
  await expect(zoom).toHaveText("100%");

  // Disegna, sposta la vista di 200px con la mano: il rettangolo ora sta 200px più a destra.
  await gm.page.getByRole("button", { name: "Rettangolo" }).click();
  await drag(gm.page, [300, 200], [500, 320]);
  await gm.page.getByRole("button", { name: "Sposta la vista" }).click();
  await drag(gm.page, [600, 500], [800, 500]);
  await gm.page.getByRole("button", { name: "Seleziona" }).click();
  await gm.page.mouse.click(box.x + 500, box.y + 260);
  await gm.page.screenshot({ path: "e2e/.data/panned-selected.png" });
  await gm.page.keyboard.press("Delete");
  await expectItems(gm.page, 0);
});
