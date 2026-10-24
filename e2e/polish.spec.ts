import { expect, type Page, test } from "@playwright/test";
import { at, board, click, drag, placeToken, setupTable, tokenList } from "./helpers";

/** Interroga lo stage Konva della pagina (Konva si registra su window). */
function konvaCount(page: Page, selector: string) {
  return page.evaluate(
    (sel) =>
      (
        window as unknown as { Konva: { stages: { find: (s: string) => unknown[] }[] } }
      ).Konva.stages[0]?.find(sel).length ?? 0,
    selector,
  );
}

function itemPositions(page: Page) {
  return page.evaluate(() => {
    type Node = { x: () => number; y: () => number };
    const { Konva } = window as unknown as { Konva: { stages: { find: (s: string) => Node[] }[] } };
    return (Konva.stages[0]?.find(".item") ?? []).map((n) => ({ x: n.x(), y: n.y() }));
  });
}

test("a long press pings everyone", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  const p = await at(player, 400, 300);
  await player.mouse.move(p.x, p.y);
  await player.mouse.down();
  await player.waitForTimeout(700);
  await player.mouse.up();
  await expect.poll(() => konvaCount(gm, ".ping")).toBeGreaterThan(0);
  await expect.poll(() => konvaCount(player, ".ping")).toBeGreaterThan(0);
  // Dopo un paio di secondi sparisce.
  await expect.poll(() => konvaCount(gm, ".ping"), { timeout: 5000 }).toBe(0);
});

test("others see a stroke while it is being drawn", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  await player.keyboard.press("p");
  const a = await at(player, 300, 300);
  await player.mouse.move(a.x, a.y);
  await player.mouse.down();
  await player.mouse.move(a.x + 80, a.y + 40, { steps: 8 });
  await player.mouse.move(a.x + 160, a.y + 10, { steps: 8 });
  await expect.poll(() => konvaCount(gm, ".draft")).toBe(1);
  await player.mouse.up();
  await expect.poll(() => konvaCount(gm, ".draft")).toBe(0);
  await expect(board(gm)).toHaveAttribute("data-item-count", "1");
});

test("marquee selection selects and moves shapes and tokens together", async ({ browser }) => {
  const { gm } = await setupTable(browser);
  await gm.getByRole("button", { name: "Griglia" }).click();
  await gm.getByLabel("Mostra la griglia").check(); // caselle da 70 px
  await placeToken(gm, "Guerriera", 105, 105);
  await gm.keyboard.press("r");
  await drag(gm, [200, 60], [320, 150]);
  await expect(board(gm)).toHaveAttribute("data-item-count", "2");

  // Riquadro attorno a entrambi, poi trascina il token di due caselle.
  await gm.keyboard.press("v");
  await drag(gm, [64, 30], [360, 200]); // parte a destra della barra degli strumenti
  await expect(gm.getByRole("toolbar", { name: "Selezione" })).toBeVisible();
  const before = await itemPositions(gm);
  await drag(gm, [105, 105], [245, 105]);
  await expect(tokenList(gm).getByRole("listitem")).toHaveText(["Guerriera, colonna 4, riga 2"]);
  const after = await itemPositions(gm);
  expect(after.map((p, i) => Math.round(p.x - (before[i]?.x ?? 0)))).toEqual([140, 140]);

  await gm.keyboard.press("Delete");
  await expect(board(gm)).toHaveAttribute("data-item-count", "0");
});

test("hidden items never travel over the player's websocket", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  const secret = "SegretoXYZ";
  let leaked = false;
  const watch = (page: Page) =>
    page.on("websocket", (ws) =>
      ws.on("framereceived", ({ payload }) => {
        if (Buffer.from(payload as string | Buffer).includes(secret)) leaked = true;
      }),
    );
  watch(player);
  // La pagina è già connessa: si ricarica per intercettare anche la sincronizzazione iniziale.
  await player.reload();
  await expect(player.getByText("Connesso")).toBeVisible();

  await gm.getByRole("button", { name: "Crea nascosti" }).click();
  await placeToken(gm, secret, 105, 105);
  await expect(tokenList(gm).getByRole("listitem")).toHaveText([`${secret}, nascosto`]);
  await player.reload();
  await expect(player.getByText("Connesso")).toBeVisible();
  await player.waitForTimeout(500);
  expect(leaked).toBe(false);

  // Controprova: rivelato, il nome passa davvero sul websocket del giocatore.
  await gm.keyboard.press("v");
  await click(gm, 105, 105);
  await gm.keyboard.press("Shift+H");
  await expect(tokenList(player).getByRole("listitem")).toHaveText([secret]);
  expect(leaked).toBe(true);
});
