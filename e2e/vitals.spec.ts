import { expect, type Page, test } from "@playwright/test";
import { board, click, placeToken, setupTable, tokenList } from "./helpers";

test("secret hit points stay with the GM while players see the band and set conditions", async ({
  browser,
}) => {
  const { gm, player } = await setupTable(browser);
  // La Y.Map con i PF segreti sta nel documento del GM: il suo nome non deve mai arrivare al
  // giocatore, nemmeno con la sincronizzazione iniziale.
  const frames = { gm: false, player: false };
  const watch = (page: Page, who: keyof typeof frames) =>
    page.on("websocket", (ws) =>
      ws.on("framereceived", ({ payload }) => {
        if (Buffer.from(payload as string | Buffer).includes("vitals")) frames[who] = true;
      }),
    );
  watch(player, "player");
  watch(gm, "gm");
  // Controprova: il GM, ricaricando, riceve il suo documento (la lavagna vuota non si sposta).
  await gm.reload();
  await expect(board(gm)).toHaveAttribute("data-synced", "true");

  await placeToken(gm, "Orco", 105, 405);
  await gm.keyboard.press("v");
  await click(gm, 105, 405);
  await gm.getByRole("button", { name: "Aggiungi PF" }).click();
  await gm.getByLabel("PF massimi").fill("30");
  await gm.getByLabel("PF", { exact: true }).fill("30");
  const damage = gm.getByLabel("Danno o cura");
  await damage.fill("-20");
  await damage.press("Enter");

  await expect(tokenList(gm).getByRole("listitem")).toHaveText(["Orco, 10 punti ferita su 30"]);
  await expect(tokenList(player).getByRole("listitem")).toHaveText(["Orco, malconcio"]);

  // Il giocatore non ha i campi dei PF, ma può mettere una condizione. I token stanno in basso:
  // il pannello di selezione, in alto, va a capo e coprirebbe i clic.
  await player.keyboard.press("v");
  await click(player, 105, 405);
  await expect(player.getByRole("button", { name: "Condizioni" })).toBeVisible();
  await expect(player.getByLabel("PF", { exact: true })).toHaveCount(0);
  await player.getByRole("button", { name: "Condizioni" }).click();
  await player.getByRole("button", { name: "Prono" }).click();
  await expect(tokenList(gm).getByRole("listitem")).toHaveText([
    "Orco, 10 punti ferita su 30, prono",
  ]);

  // Visibili a tutti, i numeri arrivano anche al giocatore.
  await gm.getByLabel("Chi vede i PF").selectOption("all");
  await expect(tokenList(player).getByRole("listitem")).toHaveText([
    "Orco, 10 punti ferita su 30, prono",
  ]);

  // Anche la sincronizzazione iniziale (ricaricando, la vista si centra sul token).
  await player.reload();
  await expect(board(player)).toHaveAttribute("data-synced", "true");
  await expect(tokenList(player).getByRole("listitem")).toHaveText([
    "Orco, 10 punti ferita su 30, prono",
  ]);
  expect(frames.player).toBe(false);
  expect(frames.gm).toBe(true);
});

test("damage applies to every selected token in one step", async ({ browser }) => {
  const { gm } = await setupTable(browser);
  await placeToken(gm, "Goblin", 105, 405);
  await placeToken(gm, "Coboldo", 245, 405);
  await gm.keyboard.press("v");
  for (const x of [105, 245]) {
    await click(gm, x, 405);
    await gm.getByRole("button", { name: "Aggiungi PF" }).click();
    await gm.getByLabel("Chi vede i PF").selectOption("all");
  }
  await click(gm, 105, 405);
  await gm.keyboard.down("Shift");
  await click(gm, 245, 405);
  await gm.keyboard.up("Shift");
  const damage = gm.getByLabel("Danno o cura a 2 token con PF");
  await damage.fill("-4");
  await damage.press("Enter");
  await expect(tokenList(gm).getByRole("listitem")).toHaveText([
    "Goblin, 6 punti ferita su 10",
    "Coboldo, 6 punti ferita su 10",
  ]);
  // Un clic sulla lavagna vuota toglie il fuoco dal campo, così Ctrl+Z annulla sulla lavagna.
  await click(gm, 600, 600);
  await gm.keyboard.press("Control+z");
  await expect(tokenList(gm).getByRole("listitem")).toHaveText([
    "Goblin, 10 punti ferita su 10",
    "Coboldo, 10 punti ferita su 10",
  ]);
});

test("conditions with a duration end when the token's turn starts", async ({ browser }) => {
  const { gm, player } = await setupTable(browser);
  await placeToken(gm, "Aldo", 175, 405);
  await gm.keyboard.press("v");
  await click(gm, 175, 405);
  await gm.getByRole("button", { name: "Condizioni" }).click();
  await gm.getByRole("button", { name: "Prono" }).click();
  await gm.getByLabel("Round di Prono").fill("1");
  await gm.getByLabel("Nuova condizione personalizzata").fill("Benedetto");
  await gm.getByLabel("Nuova condizione personalizzata").press("Enter");
  await expect(tokenList(player).getByRole("listitem")).toHaveText([
    "Aldo, prono, 1 round, Benedetto",
  ]);

  await gm.getByRole("button", { name: "Turni" }).click();
  const panel = gm.getByRole("region", { name: "Turni" });
  await panel.getByRole("button", { name: "Aggiungi selezione" }).click();
  await panel.getByRole("button", { name: "Avanti" }).click();
  await expect(panel.getByRole("status")).toHaveText("Finita su Aldo: prono");
  await expect(tokenList(player).getByRole("listitem")).toHaveText(["Aldo, Benedetto"]);

  // D porta il fuoco sul campo di danno e cura del token selezionato.
  await click(gm, 600, 600);
  await click(gm, 175, 405);
  await gm.getByRole("button", { name: "Aggiungi PF" }).click();
  await gm.keyboard.press("d");
  await expect(gm.getByLabel("Danno o cura")).toBeFocused();
});
