import { type Browser, expect, type Page, test } from "@playwright/test";
import { joinAs, setupTable } from "./helpers";

async function joinPlayer(
  browser: Browser,
  roomId: string,
  name: string,
  onFrame?: (text: Buffer) => void,
) {
  const page = await (await browser.newContext()).newPage();
  if (onFrame) {
    page.on("websocket", (ws) =>
      ws.on("framereceived", ({ payload }) => onFrame(Buffer.from(payload as string | Buffer))),
    );
  }
  await page.goto(`/r/${roomId}`);
  await joinAs(page, name);
  return page;
}

const messages = (page: Page) => page.getByRole("region", { name: "Messaggi" });

async function writeTo(page: Page, recipient: string, text: string) {
  const panel = messages(page);
  await panel.getByLabel("Scrivi a").selectOption({ label: recipient });
  await panel.getByLabel("Messaggio").fill(text);
  await panel.getByLabel("Messaggio").press("Enter");
  await expect(panel.getByRole("list", { name: `Conversazione con ${recipient}` })).toContainText(
    text,
  );
  await panel.getByRole("button", { name: "Torna ai messaggi" }).click();
}

test("private messages: players and GM write to each other, the GM reads everything", async ({
  browser,
}) => {
  const { gm, player: arwen, roomId } = await setupTable(browser);
  const secret = "La chiave è sotto il tappeto";
  let leakedToCarlo = false;
  const bilbo = await joinPlayer(browser, roomId, "Bilbo");
  const carlo = await joinPlayer(browser, roomId, "Carlo", (payload) => {
    if (payload.includes(secret)) leakedToCarlo = true;
  });
  await expect(messages(arwen).getByText("Il GM può leggere tutti i messaggi.")).toBeVisible();

  // Arwen scrive a Bilbo; Bilbo vede il messaggio non letto e risponde.
  await writeTo(arwen, "Bilbo", secret);
  const bilboPanel = messages(bilbo);
  await expect(bilboPanel.locator(".unread-badge").first()).toHaveText("1");
  await bilboPanel.getByRole("button", { name: /Arwen/ }).click();
  await expect(bilboPanel.getByRole("list", { name: "Conversazione con Arwen" })).toContainText(
    secret,
  );
  await bilboPanel.getByLabel("Messaggio").fill("Perfetto, a stanotte");
  await bilboPanel.getByLabel("Messaggio").press("Enter");
  await expect(bilboPanel.locator(".unread-badge")).toHaveCount(0);

  // Il GM legge la conversazione tra i due, senza poter rispondere.
  const gmPanel = messages(gm);
  // I due nomi compaiono in ordine di id del profilo, che è casuale.
  await gmPanel.getByRole("button", { name: /Arwen ↔ Bilbo|Bilbo ↔ Arwen/ }).click();
  const thread = gmPanel.getByRole("list", {
    name: /Conversazione con (Arwen ↔ Bilbo|Bilbo ↔ Arwen)/,
  });
  await expect(thread).toContainText(secret);
  await expect(thread).toContainText("Perfetto, a stanotte");
  await expect(gmPanel.getByLabel("Messaggio")).toHaveCount(0);
  await gmPanel.getByRole("button", { name: "Torna ai messaggi" }).click();

  // Il GM scrive a Carlo, che risponde al GM.
  await writeTo(gm, "Carlo", "Senti dei passi dietro di te");
  const carloPanel = messages(carlo);
  await carloPanel.getByRole("button", { name: /GM/ }).click();
  await expect(carloPanel.getByRole("list", { name: /Conversazione con/ })).toContainText(
    "Senti dei passi",
  );
  await carloPanel.getByLabel("Messaggio").fill("Mi giro con la spada sguainata");
  await carloPanel.getByLabel("Messaggio").press("Enter");
  await expect(gmPanel.getByRole("button", { name: /Carlo/ })).toContainText("Mi giro");

  // Carlo non ha mai ricevuto i messaggi tra Arwen e Bilbo, nemmeno sul WebSocket.
  await expect(carloPanel.getByRole("button", { name: /Arwen|Bilbo/ })).toHaveCount(0);
  expect(leakedToCarlo).toBe(false);
  await gm.screenshot({ path: "e2e/.data/messages-gm.png" });
  await bilbo.screenshot({ path: "e2e/.data/messages-bilbo.png" });
});
