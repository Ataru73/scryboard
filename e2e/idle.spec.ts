import { expect, test } from "@playwright/test";
import { board, joinAs } from "./helpers";

test("dopo dieci minuti senza attività ci si disconnette e si riprende all'interazione", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await page.getByLabel("Nome della stanza").fill("Silenzio");
  await page.getByRole("button", { name: "Crea stanza come GM" }).click();
  await joinAs(page, "Master");

  await page.clock.fastForward("11:00");
  await expect(page.getByText("Inattivo: tocca per riprendere")).toBeVisible();

  await page.mouse.move(300, 300);
  await expect(page.getByText("Connesso")).toBeVisible();
  await expect(board(page)).toHaveAttribute("data-synced", "true");
});
