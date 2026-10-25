import { expect, type Page, test } from "@playwright/test";
import { at, board, click, drag, placeToken, setupTable } from "./helpers";

interface StageNode {
  id: () => string;
  x: () => number;
  y: () => number;
  points?: () => number[];
}

async function findNodes(page: Page, selector: string) {
  return page.evaluate((name) => {
    type Node = StageNode;
    const { Konva } = window as unknown as { Konva: { stages: { find: (s: string) => Node[] }[] } };
    return (Konva.stages[0]?.find(name) ?? []).map((node) => ({
      id: node.id(),
      x: node.x(),
      y: node.y(),
      points: node.points?.() ?? [],
    }));
  }, selector);
}

async function tokenPosition(page: Page) {
  const nodes = await findNodes(page, ".item");
  const node = nodes[0];
  if (nodes.length !== 1 || !node) throw new Error(`expected one token, found ${nodes.length}`);
  return { x: node.x, y: node.y };
}

async function dragWithAlt(page: Page, from: [number, number], to: [number, number]) {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.keyboard.down("Alt");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
}

async function dragThrough(page: Page, points: Array<[number, number]>) {
  const first = points[0];
  if (!first) return;
  const start = await at(page, ...first);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const point of points.slice(1)) {
    const next = await at(page, ...point);
    await page.mouse.move(next.x, next.y, { steps: 8 });
  }
  await page.mouse.up();
}

async function enableGrid(gm: Page) {
  await gm.getByRole("button", { name: "Griglia", exact: true }).click();
  await gm.getByLabel("Mostra la griglia").check();
}

test("GM draws snapped walls and doors; players see only doors and toggle unlocked ones", async ({
  browser,
}) => {
  const { gm, player } = await setupTable(browser);
  await expect(player.getByRole("button", { name: "Muri", exact: true })).toHaveCount(0);
  await player.keyboard.press("w");
  await expect(player.getByRole("toolbar", { name: "Muri", exact: true })).toHaveCount(0);
  await enableGrid(gm);

  await gm.keyboard.press("w");
  await click(gm, 103, 302);
  await click(gm, 213, 302);
  await click(gm, 213, 442);
  await gm.keyboard.press("Enter");
  await expect(board(player)).toHaveAttribute("data-wall-count", "1");
  await expect
    .poll(async () => (await findNodes(gm, ".wall-line"))[0]?.points)
    .toEqual([70, 280, 210, 280, 210, 420]);
  await expect.poll(async () => (await findNodes(player, ".wall-line")).length).toBe(0);

  await gm
    .getByRole("toolbar", { name: "Muri", exact: true })
    .getByRole("button", { name: "Porta" })
    .click();
  await click(gm, 353, 302);
  await click(gm, 423, 302);
  await expect(board(player)).toHaveAttribute("data-wall-count", "2");
  await expect.poll(async () => (await findNodes(player, ".door-icon")).length).toBe(1);
  await expect.poll(async () => (await findNodes(player, ".wall-line")).length).toBe(0);

  const doorAt = await at(player, 385, 280);
  await player.mouse.click(doorAt.x, doorAt.y, { button: "right" });
  await expect.poll(async () => (await findNodes(player, ".door-closed")).length).toBe(1);
  await click(player, 385, 280);
  await expect.poll(async () => (await findNodes(gm, ".door-open")).length).toBe(1);
  await gm.keyboard.press("v");
  await click(gm, 350, 280);
  const selected = gm.getByRole("toolbar", { name: "Muro selezionato" });
  await expect(selected).toBeVisible();
  await selected.getByRole("button", { name: "A chiave" }).click();
  await expect.poll(async () => (await findNodes(player, ".door-locked")).length).toBe(1);
  await click(player, 385, 280);
  await expect.poll(async () => (await findNodes(gm, ".door-locked")).length).toBe(1);

  // Il GM apre anche una porta a chiave; annulla/ripeti copre il cambio di stato.
  await click(gm, 385, 280);
  await expect.poll(async () => (await findNodes(player, ".door-open")).length).toBe(1);
  await gm.keyboard.press("Control+z");
  await expect.poll(async () => (await findNodes(player, ".door-locked")).length).toBe(1);
  await gm.keyboard.press("Control+Shift+z");
  await expect.poll(async () => (await findNodes(player, ".door-open")).length).toBe(1);
  await player.reload();
  await expect(player.getByText("Connesso")).toBeVisible();
  await expect(board(player)).toHaveAttribute("data-wall-count", "2");
  await expect.poll(async () => (await findNodes(player, ".door-open")).length).toBe(1);
});

test("walls block the whole token drag, Alt only bypasses them for the GM, open doors let through", async ({
  browser,
}) => {
  const { gm, player } = await setupTable(browser);
  await enableGrid(gm);
  await gm.keyboard.press("w");
  await click(gm, 210, 210);
  await click(gm, 210, 420);
  await gm.keyboard.press("Enter");
  await gm
    .getByRole("toolbar", { name: "Muri", exact: true })
    .getByRole("button", { name: "Porta" })
    .click();
  await click(gm, 420, 210);
  await click(gm, 420, 420);
  await placeToken(gm, "Arwen", 105, 315);
  await expect(board(player)).toHaveAttribute("data-item-count", "1");

  await player.keyboard.press("v");
  await drag(player, [105, 315], [385, 315]);
  await expect.poll(async () => (await tokenPosition(player)).x).toBeCloseTo(209.5, 1);
  // Anche curvando oltre l'estremità non si può saltare il muro fra l'ultima posizione e il cursore.
  await dragThrough(player, [
    [209.5, 315],
    [385, 315],
    [385, 700],
  ]);
  await expect.poll(async () => (await tokenPosition(player)).x).toBeLessThan(210);
  // Alt del giocatore disattiva lo snap, ma non attraversa il muro.
  await dragWithAlt(player, [209.5, 315], [385, 315]);
  await expect.poll(async () => (await tokenPosition(player)).x).toBeLessThan(210);
  // Alt del GM ignora invece sia snap sia muri.
  await gm.keyboard.press("v");
  await dragWithAlt(gm, [209.5, 315], [385, 315]);
  await expect.poll(async () => Math.abs((await tokenPosition(gm)).x - 385)).toBeLessThan(1);

  await drag(player, [385, 315], [525, 315]);
  await expect.poll(async () => (await tokenPosition(player)).x).toBeLessThan(420);
  // Sposta il token dall'icona, poi apri la porta e riprova il passaggio.
  await dragWithAlt(player, [419.5, 315], [350, 315]);
  await click(player, 420, 315);
  await expect.poll(async () => (await findNodes(player, ".door-open")).length).toBe(1);
  await dragWithAlt(player, [350, 315], [525, 315]);
  await expect.poll(async () => Math.abs((await tokenPosition(player)).x - 525)).toBeLessThan(1);
});

test("biome contours generate one undoable wall batch and existing walls can be edited", async ({
  browser,
}) => {
  const { gm, player } = await setupTable(browser);
  await gm.keyboard.press("b");
  const terrain = gm.getByRole("toolbar", { name: "Terreno" });
  await terrain.getByRole("button", { name: "Roccia", exact: true }).click();
  await terrain.getByRole("button", { name: "Regione", exact: true }).click();
  await click(gm, 200, 200);
  await click(gm, 500, 200);
  await click(gm, 500, 500);
  await click(gm, 200, 500);
  await gm.keyboard.press("Enter");
  await expect(board(player)).toHaveAttribute("data-terrain-count", "1");

  await gm.keyboard.press("w");
  await gm.getByRole("button", { name: "Crea muri dai bordi" }).click();
  await expect(gm.getByText(/contorn[oi] creat[oi]/)).toBeVisible();
  await expect
    .poll(async () => Number(await board(player).getAttribute("data-wall-count")))
    .toBeGreaterThan(0);
  const generated = Number(await board(gm).getAttribute("data-wall-count"));
  await gm.keyboard.press("Control+z");
  await expect(board(player)).toHaveAttribute("data-wall-count", "0");
  await gm.keyboard.press("Control+Shift+z");
  await expect(board(player)).toHaveAttribute("data-wall-count", String(generated));

  // Rigenerare dagli stessi bordi non duplica i muri.
  await gm.getByRole("button", { name: "Crea muri dai bordi" }).click();
  await expect(gm.getByText("I muri di questi bordi ci sono già.")).toBeVisible();
  await expect(board(player)).toHaveAttribute("data-wall-count", String(generated));

  // Un muro disegnato a mano si seleziona, modifica dalle maniglie ed elimina.
  await click(gm, 700, 200);
  await click(gm, 700, 400);
  await gm.keyboard.press("Enter");
  await expect(board(player)).toHaveAttribute("data-wall-count", String(generated + 1));
  await gm.keyboard.press("v");
  await click(gm, 700, 300);
  await expect(gm.getByRole("toolbar", { name: "Muro selezionato" })).toBeVisible();
  await expect.poll(async () => (await findNodes(gm, ".wall-handle")).length).toBe(2);
  await drag(gm, [700, 200], [760, 160]);
  await expect.poll(async () => (await findNodes(gm, ".wall-handle"))[0]?.x).toBeCloseTo(760, 0);
  await expect.poll(async () => (await findNodes(gm, ".wall-handle"))[0]?.y).toBeCloseTo(160, 0);
  await gm.getByRole("button", { name: "Elimina muro" }).click();
  await expect(board(player)).toHaveAttribute("data-wall-count", String(generated));
});

test("doors under the fog are invisible to players and cannot be opened blindly", async ({
  browser,
}) => {
  const { gm, player } = await setupTable(browser);
  await enableGrid(gm);
  await gm.keyboard.press("w");
  await gm
    .getByRole("toolbar", { name: "Muri", exact: true })
    .getByRole("button", { name: "Porta" })
    .click();
  await click(gm, 280, 280);
  await click(gm, 350, 280);
  await expect.poll(async () => (await findNodes(player, ".door-icon")).length).toBe(1);

  await gm.keyboard.press("f");
  const fog = gm.getByRole("toolbar", { name: "Nebbia" });
  await fog.getByRole("button", { name: "Copri tutto", exact: true }).click();
  await expect(board(player)).toHaveAttribute("data-fog-count", "1");
  await expect.poll(async () => (await findNodes(player, ".door-icon")).length).toBe(0);

  // Il giocatore clicca alla cieca dove sta la porta: non succede nulla.
  await click(player, 315, 280);
  await player.waitForTimeout(300);
  await expect.poll(async () => (await findNodes(gm, ".door-closed")).length).toBe(1);

  // Il GM scopre la zona: la porta ricompare e si apre.
  await fog.getByRole("button", { name: "Scopri", exact: true }).click();
  await drag(gm, [240, 240], [400, 320]);
  await expect.poll(async () => (await findNodes(player, ".door-icon")).length).toBe(1);
  // Konva aggiorna l'area cliccabile al frame successivo: un clic immediato andrebbe a vuoto.
  await player.waitForTimeout(150);
  await click(player, 315, 280);
  await expect.poll(async () => (await findNodes(gm, ".door-open")).length).toBe(1);
});

test("the eraser removes walls and doors for the GM, in one undo step each", async ({
  browser,
}) => {
  const { gm, player } = await setupTable(browser);
  await gm.keyboard.press("w");
  await click(gm, 100, 300);
  await click(gm, 300, 300);
  await gm.keyboard.press("Enter");
  await gm
    .getByRole("toolbar", { name: "Muri", exact: true })
    .getByRole("button", { name: "Porta" })
    .click();
  await click(gm, 100, 400);
  await click(gm, 300, 400);
  await expect(board(gm)).toHaveAttribute("data-wall-count", "2");
  await expect(board(player)).toHaveAttribute("data-wall-count", "2");

  await gm.keyboard.press("e");
  await click(gm, 200, 300);
  await expect(board(gm)).toHaveAttribute("data-wall-count", "1");
  // La porta si cancella anche cliccando sulla sua icona.
  await click(gm, 200, 400);
  await expect(board(gm)).toHaveAttribute("data-wall-count", "0");
  await expect(board(player)).toHaveAttribute("data-wall-count", "0");

  await gm.keyboard.press("Control+z");
  await expect(board(gm)).toHaveAttribute("data-wall-count", "1");
});
