import { expect, type Page, test } from "@playwright/test";
import { board, click, drag, placeToken, setupTable, tokenList } from "./helpers";

/** Posizione sullo schermo del primo token e dimensioni della lavagna. */
async function tokenOnScreen(page: Page) {
  return page.evaluate(() => {
    type Node = { getAbsolutePosition: () => { x: number; y: number } };
    type Stage = { find: (s: string) => Node[]; width: () => number; height: () => number };
    type StageView = Stage & { x: () => number; scaleX: () => number };
    const { Konva } = window as unknown as { Konva: { stages: StageView[] } };
    const stage = Konva.stages[0] as StageView;
    const node = stage.find(".item")[0] as Node;
    const p = node.getAbsolutePosition();
    return {
      x: p.x,
      y: p.y,
      width: stage.width(),
      height: stage.height(),
      stageX: stage.x(),
      scale: stage.scaleX(),
    };
  });
}

async function centered(page: Page) {
  const p = await tokenOnScreen(page);
  return Math.abs(p.x - p.width / 2) < 4 && Math.abs(p.y - p.height / 2) < 4;
}

test("the table screen shows the players' view without controls, even in the GM's browser", async ({
  browser,
}) => {
  const { gm, player } = await setupTable(browser);
  const link = await gm.getByLabel("Link per lo schermo al tavolo").inputValue();
  await gm.getByRole("button", { name: "Crea nascosti" }).click();
  await placeToken(gm, "Segreto", 105, 405);
  await gm.getByRole("button", { name: "Crea nascosti" }).click();
  await placeToken(gm, "Goblin", 245, 405);

  // Nello stesso browser del GM (che ha il token GM salvato) resta comunque uno schermo da giocatori.
  const screen = await gm.context().newPage();
  await screen.goto(link);
  await expect(board(screen)).toHaveAttribute("data-synced", "true");
  await expect(tokenList(screen).getByRole("listitem")).toHaveText(["Goblin"]);
  await expect(screen.getByRole("toolbar", { name: "Strumenti" })).toHaveCount(0);
  await expect(screen.getByLabel("Nome", { exact: true })).toHaveCount(0);
  await expect(screen.getByLabel("Lingua")).toHaveCount(0);

  // Al tavolo si vede come schermo, ma non è un destinatario dei messaggi.
  const atTable = gm.getByRole("list", { name: "Al tavolo" });
  await expect(
    atTable.getByRole("listitem").filter({ hasText: "Schermo al tavolo" }),
  ).toContainText("Schermo");
  await expect(player.getByRole("option", { name: "Schermo al tavolo" })).toHaveCount(0);
  await expect(gm.getByRole("option", { name: "Arwen" }).first()).toBeAttached();
  await expect(gm.getByRole("option", { name: "Schermo al tavolo" })).toHaveCount(0);
});

test("the table screen follows the party, the GM's summon and the turn", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  const link = await gm.getByLabel("Link per lo schermo al tavolo").inputValue();
  await placeToken(player, "Arwen", 200, 400);
  await player.keyboard.press("v");

  const screen = await (await browser.newContext()).newPage();
  await screen.goto(link);
  await expect(board(screen)).toHaveAttribute("data-synced", "true");
  await expect.poll(() => centered(screen)).toBe(true);
  const before = await tokenOnScreen(screen);

  // Il token del gruppo si sposta: lo schermo lo rimette al centro.
  await drag(player, [200, 400], [700, 600]);
  await expect.poll(async () => (await tokenOnScreen(screen)).stageX).not.toBe(before.stageX);
  await expect.poll(() => centered(screen)).toBe(true);

  // Il turno in corso si legge sullo schermo.
  await gm.getByRole("button", { name: "Turni" }).click();
  await click(gm, 700, 600);
  const panel = gm.getByRole("region", { name: "Turni" });
  await panel.getByRole("button", { name: "Aggiungi selezione" }).click();
  await panel.getByRole("button", { name: "Avanti" }).click();
  await expect(screen.getByRole("status").filter({ hasText: "Turno di" })).toHaveText(
    "Round 1 · Turno di Arwen",
  );

  // Il richiamo del GM vince sull'inquadratura finché il gruppo non si muove.
  await gm.getByRole("button", { name: "Ingrandisci" }).click();
  await gm.getByRole("button", { name: "Porta qui i giocatori" }).click();
  await expect.poll(async () => (await tokenOnScreen(screen)).scale).toBe(1.25);
  await screen.waitForTimeout(800);
  expect((await tokenOnScreen(screen)).scale).toBe(1.25);
});
