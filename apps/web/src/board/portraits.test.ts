import { PORTRAITS } from "@scryboard/shared";
import { describe, expect, it } from "vitest";
import { PORTRAIT_PATHS } from "./portraits.gen";

describe("generated portrait paths", () => {
  it("has a path for every catalog entry and nothing else", () => {
    expect(Object.keys(PORTRAIT_PATHS).sort()).toEqual(PORTRAITS.map((p) => p.id).sort());
    for (const [id, d] of Object.entries(PORTRAIT_PATHS)) expect(d, id).toMatch(/^[Mm]/);
  });
});
