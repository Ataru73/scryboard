import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { at, board, click, drag, placeToken, setupTable, tokenList } from "./helpers";

test("the GM hides and reveals items; players never receive hidden ones", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  await placeToken(gm, "Drago", 105, 105);
  await expect(tokenList(player).getByRole("listitem")).toHaveText(["Drago"]);

  await gm.keyboard.press("v");
  await click(gm, 105, 105);
  await gm.getByRole("button", { name: "Nascondi", exact: true }).click();
  await expect(tokenList(gm).getByRole("listitem")).toHaveText(["Drago, nascosto"]);
  await expect(tokenList(player).getByRole("listitem")).toHaveCount(0);
  await expect(board(player)).toHaveAttribute("data-item-count", "0");

  // Anche dopo un ricaricamento il giocatore non lo riceve.
  await player.reload();
  await expect(player.getByText("Connesso")).toBeVisible();
  await expect(board(player)).toHaveAttribute("data-item-count", "0");

  await gm.keyboard.press("Shift+H");
  await expect(tokenList(player).getByRole("listitem")).toHaveText(["Drago"]);
  await expect(tokenList(gm).getByRole("listitem")).toHaveText(["Drago"]);
});

test("items created in hidden mode stay secret, images included, until revealed", async ({
  browser,
}) => {
  const { gm, player, roomId } = await setupTable(browser);
  await gm.getByRole("button", { name: "Crea nascosti" }).click();

  await gm.locator("input[type=file]").first().setInputFiles("e2e/fixtures/map.png");
  // L'id dell'asset è l'hash del contenuto.
  const assetId = `${createHash("sha256").update(readFileSync("e2e/fixtures/map.png")).digest("hex")}.png`;
  await expect(board(gm)).toHaveAttribute("data-item-count", "1");
  await expect(board(player)).toHaveAttribute("data-item-count", "0");

  // Il giocatore non può scaricare l'immagine nemmeno conoscendone l'URL.
  const assetUrl = `/api/rooms/${roomId}/assets/${assetId}`;
  const status = () => player.evaluate(async (url) => (await fetch(url)).status, assetUrl);
  expect(await status()).toBe(404);

  // Il GM la rivela: ora il giocatore vede l'oggetto e può scaricare l'immagine.
  await gm.keyboard.press("v");
  const box = await board(gm).boundingBox();
  if (!box) throw new Error("board not visible");
  await click(gm, box.width / 2, box.height / 2);
  await gm.getByRole("button", { name: "Rivela" }).click();
  await expect(board(player)).toHaveAttribute("data-item-count", "1");
  expect(await status()).toBe(200);
});

test("fog of war: the GM covers and reveals, players cannot use the tool", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  await expect(player.getByRole("button", { name: "Nebbia" })).toHaveCount(0);
  await player.keyboard.press("f");
  await expect(player.getByRole("toolbar", { name: "Nebbia" })).toHaveCount(0);

  await placeToken(gm, "Mimic", 315, 245);
  await gm.keyboard.press("f");
  const fog = gm.getByRole("toolbar", { name: "Nebbia" });
  await fog.getByRole("button", { name: "Copri tutto", exact: true }).click();
  await expect(board(player)).toHaveAttribute("data-fog-count", "1");

  // Scopre un rettangolo e poi un poligono.
  await fog.getByRole("button", { name: "Scopri", exact: true }).click();
  await drag(gm, [200, 150], [450, 350]);
  await fog.getByRole("button", { name: "Poligono" }).click();
  await click(gm, 600, 150);
  await click(gm, 800, 150);
  await click(gm, 700, 350);
  await gm.keyboard.press("Enter");
  // Un secondo poligono chiuso con il doppio clic sull'ultimo vertice.
  await click(gm, 500, 450);
  await click(gm, 600, 450);
  const last = await at(gm, 550, 550);
  await gm.mouse.dblclick(last.x, last.y);
  await expect(board(player)).toHaveAttribute("data-fog-count", "4");
  await player.screenshot({ path: "e2e/.data/fog-player.png" });
  await gm.screenshot({ path: "e2e/.data/fog-gm.png" });

  // Annulla e "Scopri tutto".
  await gm.keyboard.press("Control+z");
  await expect(board(player)).toHaveAttribute("data-fog-count", "3");
  await fog.getByRole("button", { name: "Scopri tutto", exact: true }).click();
  await expect(board(player)).toHaveAttribute("data-fog-count", "0");
});
