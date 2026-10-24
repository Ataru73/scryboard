import { describe, expect, it } from "vitest";
import { PORTRAIT_CATEGORIES, PORTRAITS } from "./portraits";

const ID_PATTERN = /^[a-z0-9-]{1,40}$/;

describe("portrait catalog", () => {
  it("has unique ids that fit the token field", () => {
    const ids = PORTRAITS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(ID_PATTERN);
  });

  it("credits an author and a known category for every entry", () => {
    const categories = new Set<string>(PORTRAIT_CATEGORIES.map((c) => c.id));
    for (const p of PORTRAITS) {
      expect(p.author.trim(), p.id).not.toBe("");
      expect(categories.has(p.category), p.id).toBe(true);
      expect(p.size, p.id).toBeGreaterThan(0);
    }
  });
});
