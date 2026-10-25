import {
  BIOMES,
  DIAGONAL_RULES,
  DRAW_COLORS,
  GRID_TYPES,
  LIGHT_PRESETS,
  PATH_STYLES,
  PORTRAIT_CATEGORIES,
  PORTRAITS,
  STAMPS,
  TEMPLATE_SHAPES,
  TOKEN_SIZES,
} from "@scryboard/shared";
import { afterEach, describe, expect, it as test } from "vitest";
import { catalogLabel } from "./catalog";
import { DEFAULT_LANGUAGE, i18n } from "./index";
import { en } from "./locales/en";
import { it } from "./locales/it";

type Messages = { [key: string]: string | Messages };

function messageKeys(messages: Messages, prefix = ""): string[] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : messageKeys(value, path);
  });
}

afterEach(async () => {
  await i18n.changeLanguage(DEFAULT_LANGUAGE);
});

describe("i18n", () => {
  test("English and Italian have identical message keys", () => {
    expect(messageKeys(it as unknown as Messages).sort()).toEqual(
      messageKeys(en as unknown as Messages).sort(),
    );
  });

  test("switches between English and Italian", async () => {
    await i18n.changeLanguage("en");
    expect(i18n.t("common.language")).toBe("Language");

    await i18n.changeLanguage("it");
    expect(i18n.t("common.language")).toBe("Lingua");
  });

  test("translates catalog IDs that contain dots", async () => {
    await i18n.changeLanguage("en");
    expect(catalogLabel(i18n.t, "tokenSizes", "0.5", "Minuscola")).toBe("Tiny");
  });

  test("loads every namespace and supports default values", () => {
    for (const messages of [en, it]) {
      for (const namespace of Object.values(messages)) {
        expect(messageKeys(namespace as Messages).length).toBeGreaterThan(0);
      }
    }
    expect(i18n.t("missing.message", { defaultValue: "Fallback" })).toBe("Fallback");
  });

  test("localizes every shared catalog entry", () => {
    const expected = {
      biomes: BIOMES.map(({ id }) => id),
      gridTypes: GRID_TYPES.map(({ id }) => id),
      diagonalRules: DIAGONAL_RULES.map(({ id }) => id),
      lights: LIGHT_PRESETS.map(({ id }) => id),
      paths: PATH_STYLES.map(({ id }) => id),
      portraitCategories: PORTRAIT_CATEGORIES.map(({ id }) => id),
      portraits: PORTRAITS.map(({ id }) => id),
      stamps: STAMPS.map(({ id }) => id),
      templates: TEMPLATE_SHAPES.map(({ id }) => id),
      tokenSizes: TOKEN_SIZES.map(({ size }) => String(size).replaceAll(".", "_")),
      colors: DRAW_COLORS.map((color) => color.replace("#", "")),
    };

    for (const catalog of [en.catalog, it.catalog]) {
      for (const [group, ids] of Object.entries(expected)) {
        expect(Object.keys(catalog[group as keyof typeof catalog]).sort()).toEqual(ids.sort());
      }
    }
  });
});
