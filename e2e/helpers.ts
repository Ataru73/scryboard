import { type Browser, expect, type Page } from "@playwright/test";

export async function joinAs(page: Page, name: string) {
  await page.getByLabel("Nome", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByText("Connesso")).toBeVisible();
  // "Connesso" arriva con il socket, la prima sincronizzazione dopo: si aspetta anche quella,
  // perché i test contano su coordinate schermo = mondo già dal primo clic.
  await expect(board(page)).toHaveAttribute("data-synced", "true");
}

/** GM e giocatore entrambi su una lavagna vuota: vista identica, coordinate schermo = mondo. */
export async function setupTable(browser: Browser, roomName = "Cripta") {
  const gm = await (await browser.newContext()).newPage();
  await gm.goto("/");
  await gm.getByLabel("Nome della stanza").fill(roomName);
  await gm.getByRole("button", { name: "Crea stanza come GM" }).click();
  await joinAs(gm, "Master");
  const playerLink = await gm.getByLabel("Link per i giocatori").inputValue();
  const player = await (await browser.newContext()).newPage();
  await player.goto(playerLink);
  await joinAs(player, "Arwen");
  return { gm, player, roomId: new URL(playerLink).pathname.split("/").pop() as string };
}

export const board = (page: Page) => page.getByRole("application", { name: "Lavagna" });
export const tokenList = (page: Page) => page.getByRole("list", { name: "Token sulla lavagna" });

export async function at(page: Page, x: number, y: number) {
  const box = await board(page).boundingBox();
  if (!box) throw new Error("board not visible");
  return { x: box.x + x, y: box.y + y };
}

export async function click(page: Page, x: number, y: number) {
  const p = await at(page, x, y);
  await page.mouse.click(p.x, p.y);
}

export async function drag(page: Page, from: [number, number], to: [number, number]) {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

export async function placeToken(page: Page, name: string, x: number, y: number) {
  await page.keyboard.press("k");
  await page.getByLabel("Nome del token").fill(name);
  await click(page, x, y);
}

/** Apre un gruppo della barra (Disegno, Mappa, Visibilità) e ne restituisce la fila di strumenti. */
export async function openToolGroup(page: Page, group: string) {
  await page.getByRole("button", { name: new RegExp(`^${group}:`) }).click();
  return page.getByRole("toolbar", { name: group, exact: true });
}

/** Sceglie uno strumento dentro un gruppo della barra. */
export async function pickTool(page: Page, group: string, tool: string) {
  const flyout = await openToolGroup(page, group);
  await flyout.getByRole("button", { name: tool, exact: true }).click();
}
