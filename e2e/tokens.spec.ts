import { type Browser, expect, type Page, test } from "@playwright/test";

async function joinAs(page: Page, name: string) {
  await page.getByLabel("Nome", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByText("Connesso")).toBeVisible();
}

/** GM e giocatore entrambi su una lavagna vuota: vista identica, coordinate schermo = mondo. */
async function setup(browser: Browser) {
  const gm = await (await browser.newContext()).newPage();
  await gm.goto("/");
  await gm.getByLabel("Nome della stanza").fill("Cripta");
  await gm.getByRole("button", { name: "Crea stanza come GM" }).click();
  await joinAs(gm, "Master");
  const playerLink = await gm.getByLabel("Link per i giocatori").inputValue();
  const player = await (await browser.newContext()).newPage();
  await player.goto(playerLink);
  await joinAs(player, "Arwen");
  return { gm, player };
}

const board = (page: Page) => page.getByRole("application", { name: "Lavagna" });
const tokenList = (page: Page) => page.getByRole("list", { name: "Token sulla lavagna" });

async function at(page: Page, x: number, y: number) {
  const box = await board(page).boundingBox();
  if (!box) throw new Error("board not visible");
  return { x: box.x + x, y: box.y + y };
}

async function drag(page: Page, from: [number, number], to: [number, number], alt = false) {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  if (alt) await page.keyboard.down("Alt");
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  if (alt) await page.keyboard.up("Alt");
}

async function enableGrid(gm: Page) {
  await gm.getByRole("button", { name: "Griglia" }).click();
  await gm.getByLabel("Mostra la griglia").check();
}

test("GM calibrates the grid by tracing one cell", async ({ browser }) => {
  const { gm, player } = await setup(browser);
  await enableGrid(gm);
  await gm.getByRole("button", { name: "Calibra sulla mappa" }).click();
  await drag(gm, [130, 245], [180, 295]);
  await expect(gm.getByLabel("Casella (px)")).toHaveValue("50");
  await expect(gm.getByLabel("Sposta X")).toHaveValue("30");
  await expect(gm.getByLabel("Sposta Y")).toHaveValue("45");
  await expect(gm.getByText("Griglia calibrata: caselle di 50 px.")).toBeVisible();

  // I giocatori vedono la griglia ma non possono modificarla.
  await expect(player.getByRole("button", { name: "Griglia" })).toHaveCount(0);
});

test("tokens are numbered, snap to the grid and respect the GM's lock", async ({ browser }) => {
  const { gm, player } = await setup(browser);
  await enableGrid(gm); // caselle da 70 px, offset 0

  await gm.keyboard.press("k");
  await gm.getByLabel("Nome del token").fill("Goblin");
  const p1 = await at(gm, 100, 110);
  await gm.mouse.click(p1.x, p1.y);
  const p2 = await at(gm, 250, 110);
  await gm.mouse.click(p2.x, p2.y);

  await expect(tokenList(player).getByRole("listitem")).toHaveText([
    "Goblin, colonna 2, riga 2",
    "Goblin 2, colonna 4, riga 2",
  ]);

  // Il giocatore sposta il primo goblin: si aggancia alla casella più vicina.
  await player.keyboard.press("v");
  await drag(player, [105, 105], [190, 260]);
  await expect(tokenList(gm).getByRole("listitem").first()).toHaveText("Goblin, colonna 3, riga 4");

  // Con Alt si muove libero: niente aggancio.
  await drag(player, [175, 245], [200, 252], true);
  await expect(tokenList(gm).getByRole("listitem").first()).toHaveText("Goblin, colonna 3, riga 4");

  // Il GM blocca il secondo goblin: il giocatore non può più spostarlo né cancellarlo.
  await gm.keyboard.press("v");
  const t2 = await at(gm, 245, 105);
  await gm.mouse.click(t2.x, t2.y);
  await gm.getByRole("button", { name: "Blocca" }).click();
  await expect(tokenList(player).getByRole("listitem").nth(1)).toHaveText(
    "Goblin 2, colonna 4, riga 2, bloccato",
  );
  await drag(player, [245, 105], [400, 400]);
  await player.keyboard.press("e");
  await drag(player, [235, 105], [255, 105]);
  await expect(tokenList(gm).getByRole("listitem").nth(1)).toHaveText(
    "Goblin 2, colonna 4, riga 2, bloccato",
  );
  await player.screenshot({ path: "e2e/.data/tokens-grid.png" });
});

test("a selected token can be renamed and resized from the panel", async ({ browser }) => {
  const { gm, player } = await setup(browser);
  await gm.keyboard.press("k");
  await gm.getByLabel("Nome del token").fill("Orco");
  const p = await at(gm, 300, 300);
  await gm.mouse.click(p.x, p.y);
  await gm.keyboard.press("v");
  await gm.mouse.click(p.x, p.y);

  const panel = gm.getByRole("toolbar", { name: "Selezione" });
  await panel.getByLabel("Nome del token").fill("Orco capo");
  await panel.getByLabel("Nome del token").press("Enter");
  await panel.getByLabel("Taglia").selectOption({ label: "Grande" });
  await expect(tokenList(player).getByRole("listitem")).toHaveText(["Orco capo"]);
  await gm.screenshot({ path: "e2e/.data/token-selected.png" });
});
