import { expect, test } from "@playwright/test";
import { joinAs } from "./helpers";

test("switches language, updates the document and persists the choice", async ({ page }) => {
  await page.goto("/");

  const italianSwitcher = page.getByLabel("Lingua", { exact: true });
  await expect(italianSwitcher).toHaveValue("it");
  await expect(page.getByLabel("Nome della stanza")).toBeVisible();

  await italianSwitcher.selectOption("en");
  const englishSwitcher = page.getByLabel("Language", { exact: true });
  await expect(englishSwitcher).toHaveValue("en");
  await expect(page.getByLabel("Room name")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  const box = await englishSwitcher.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (box && viewport) {
    expect(box.y).toBeLessThan(24);
    expect(box.x + box.width).toBeGreaterThan(viewport.width * 0.8);
  }

  await page.reload();
  await expect(page.getByLabel("Language", { exact: true })).toHaveValue("en");
  await expect(page.getByLabel("Room name")).toBeVisible();

  await page.getByLabel("Language", { exact: true }).selectOption("it");
  await expect(page.getByLabel("Nome della stanza")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
});

test("switches language in a room without losing the current room", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Nome della stanza").fill("Cripta");
  await page.getByRole("button", { name: "Crea stanza come GM" }).click();
  await joinAs(page, "Master");

  await page.getByLabel("Lingua", { exact: true }).selectOption("en");

  await expect(page.getByRole("heading", { name: "Cripta", exact: true })).toBeVisible();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(page.getByRole("application", { name: "Board" })).toBeVisible();
  await expect(page.getByLabel("Language", { exact: true })).toHaveValue("en");
});
