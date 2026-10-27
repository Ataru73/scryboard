import { expect, test } from "@playwright/test";
import { click, joinAs, placeToken, tokenList } from "./helpers";

test.describe("Touch and Foldable controls", () => {
  test("shows touch modifier buttons on touch devices and supports multi-select without Shift", async ({
    browser,
  }) => {
    // Simula un dispositivo tablet con touch attivo
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 800, height: 1000 },
    });
    const page = await context.newPage();
    await page.goto("/");
    await page.getByLabel("Nome della stanza").fill("Stanza Touch");
    await page.getByRole("button", { name: "Crea stanza come GM" }).click();
    await joinAs(page, "Master Touch");

    // I pulsanti di modifica touch devono essere presenti
    const multiSelectBtn = page.getByRole("button", { name: "Selezione multipla" });
    const freeGridBtn = page.getByRole("button", { name: "Movimento libero" });

    await expect(multiSelectBtn).toBeVisible();
    await expect(freeGridBtn).toBeVisible();

    // Piazza due token a coordinate libere (150, 500) e (350, 500)
    await placeToken(page, "Goblin 1", 150, 500);
    await placeToken(page, "Goblin 2", 350, 500);
    await expect(tokenList(page).getByRole("listitem")).toHaveCount(2);

    // Con lo strumento selezione attivo
    const selectToolBtn = page
      .getByRole("toolbar", { name: "Strumenti" })
      .getByRole("button", { name: "Seleziona", exact: true });
    await selectToolBtn.click();
    await expect(selectToolBtn).toHaveAttribute("aria-pressed", "true");

    // Attiva la selezione multipla touch
    await multiSelectBtn.click();
    await expect(multiSelectBtn).toHaveAttribute("aria-pressed", "true");

    // Tocca il primo token e poi il secondo
    await click(page, 150, 500);
    await page.waitForTimeout(100);
    await click(page, 350, 500);

    // Con entrambi selezionati, il pannello Selezione offre le azioni di gruppo (Duplica, Elimina)
    const selectionToolbar = page.getByRole("toolbar", { name: "Selezione" });
    await expect(selectionToolbar).toBeVisible();
    await expect(selectionToolbar.getByRole("button", { name: "Duplica" })).toBeVisible();

    // Il campo nome del singolo token non è visibile nella selezione multipla
    await expect(selectionToolbar.locator("input.token-name")).not.toBeVisible();

    // Duplicando la selezione multipla, entrambi i token vengono duplicati portando il totale a 4
    await selectionToolbar.getByRole("button", { name: "Duplica" }).click();
    await expect(tokenList(page).getByRole("listitem")).toHaveCount(4);

    // Disattiva la selezione multipla
    await multiSelectBtn.click();
    await expect(multiSelectBtn).toHaveAttribute("aria-pressed", "false");

    await context.close();
  });

  test("toggles free grid movement without Alt key", async ({ browser }) => {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 800, height: 1000 },
    });
    const page = await context.newPage();
    await page.goto("/");
    await page.getByLabel("Nome della stanza").fill("Stanza Free Grid");
    await page.getByRole("button", { name: "Crea stanza come GM" }).click();
    await joinAs(page, "Master Free");

    const freeGridBtn = page.getByRole("button", { name: "Movimento libero" });
    await expect(freeGridBtn).toHaveAttribute("aria-pressed", "false");

    await freeGridBtn.click();
    await expect(freeGridBtn).toHaveAttribute("aria-pressed", "true");

    await freeGridBtn.click();
    await expect(freeGridBtn).toHaveAttribute("aria-pressed", "false");

    await context.close();
  });

  test("handles pinch-to-zoom multi-touch gesture", async ({ browser }) => {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 800, height: 1000 },
    });
    const page = await context.newPage();
    await page.goto("/");
    await page.getByLabel("Nome della stanza").fill("Stanza Pinch");
    await page.getByRole("button", { name: "Crea stanza come GM" }).click();
    await joinAs(page, "Master Pinch");

    const zoomIndicator = page.locator("button.zoom-level");
    await expect(zoomIndicator).toHaveText("100%");

    // Simula eventi PointerEvent multi-touch sul canvas di Konva (pinch-out da 100px a 200px)
    await page.evaluate(() => {
      const el =
        document.querySelector(".konvajs-content") ?? document.querySelector(".board-area canvas");
      if (!el) throw new Error("Konva element not found");

      el.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 1,
          pointerType: "touch",
          clientX: 300,
          clientY: 500,
          bubbles: true,
        }),
      );
      el.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerId: 2,
          pointerType: "touch",
          clientX: 400,
          clientY: 500,
          bubbles: true,
        }),
      );
      el.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 1,
          pointerType: "touch",
          clientX: 250,
          clientY: 500,
          bubbles: true,
        }),
      );
      el.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 2,
          pointerType: "touch",
          clientX: 450,
          clientY: 500,
          bubbles: true,
        }),
      );
      el.dispatchEvent(
        new PointerEvent("pointerup", {
          pointerId: 1,
          pointerType: "touch",
          clientX: 250,
          clientY: 500,
          bubbles: true,
        }),
      );
      el.dispatchEvent(
        new PointerEvent("pointerup", {
          pointerId: 2,
          pointerType: "touch",
          clientX: 450,
          clientY: 500,
          bubbles: true,
        }),
      );
    });

    // Dopo un pinch-out del 100% (distanza raddoppiata da 100px a 200px), il livello di zoom deve aumentare a 200%
    await expect(zoomIndicator).toHaveText("200%");

    await context.close();
  });

  test("toggles flex mode on foldable/touch devices", async ({ browser }) => {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 800, height: 1000 },
    });
    const page = await context.newPage();
    await page.goto("/");
    await page.getByLabel("Nome della stanza").fill("Stanza Flex");
    await page.getByRole("button", { name: "Crea stanza come GM" }).click();
    await joinAs(page, "Master Flex");

    const room = page.locator(".room");
    await expect(room).toHaveAttribute("data-posture", "continuous");

    // Il pulsante Flex Mode è visibile nell'header e nella barra zoom
    const flexBtn = page.getByRole("button", { name: "Modalità Flex" }).first();
    await expect(flexBtn).toBeVisible();
    await expect(flexBtn).toHaveAttribute("aria-pressed", "false");

    // Attiva Flex Mode
    await flexBtn.click();
    await expect(flexBtn).toHaveAttribute("aria-pressed", "true");
    await expect(room).toHaveAttribute("data-posture", "folded");
    await expect(room).toHaveAttribute("data-fold-type", "tabletop");

    // In Flex Mode la sidebar è visibile
    const sidebar = page.locator("aside.sidebar");
    await expect(sidebar).toBeVisible();

    // Disattiva Flex Mode
    await flexBtn.click();
    await expect(flexBtn).toHaveAttribute("aria-pressed", "false");
    await expect(room).toHaveAttribute("data-posture", "continuous");

    await context.close();
  });
});
