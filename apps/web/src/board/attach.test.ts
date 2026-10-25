import type { TokenItem } from "@scryboard/shared";
import { describe, expect, it } from "vitest";
import { attachError, followers, parentOf } from "./attach";

const token = (id: string, attachedTo: string | null = null): TokenItem => ({
  id,
  layer: "token",
  z: 0,
  kind: "token",
  x: 0,
  y: 0,
  rotation: 0,
  locked: false,
  createdBy: "u",
  name: id,
  color: "#46a758",
  assetId: null,
  size: 1,
  attachedTo,
});

describe("followers", () => {
  const items = [token("horse"), token("rider", "horse"), token("cart", "horse"), token("other")];

  it("finds the tokens attached to the ones that move", () => {
    expect(followers(items, new Set(["horse"])).map((t) => t.id)).toEqual(["rider", "cart"]);
    expect(followers(items, new Set(["other"]))).toEqual([]);
  });

  it("skips tokens that already move on their own", () => {
    expect(followers(items, new Set(["horse", "rider"])).map((t) => t.id)).toEqual(["cart"]);
  });
});

describe("attachError", () => {
  const items = [token("horse"), token("rider", "horse"), token("cart", "rider"), token("solo")];
  const get = (id: string) => items.find((i) => i.id === id);

  it("allows a simple attachment", () => {
    expect(attachError(items, get("solo"), get("horse"))).toBeNull();
  });

  it("refuses chains, self-attachment and non-tokens", () => {
    expect(attachError(items, get("solo"), get("rider"))).toMatch(/già agganciato/);
    expect(attachError(items, get("horse"), get("solo"))).toMatch(/già agganciati/);
    expect(attachError(items, get("solo"), get("solo"))).toMatch(/se stesso/);
    expect(attachError(items, get("solo"), undefined)).toMatch(/solo un token/);
  });

  it("ignores a parent that no longer exists", () => {
    const orphan = [token("a", "gone"), token("b")];
    expect(attachError(orphan, orphan[1], orphan[0])).toBeNull();
    expect(parentOf(orphan, orphan[0] as TokenItem)).toBeUndefined();
  });
});
