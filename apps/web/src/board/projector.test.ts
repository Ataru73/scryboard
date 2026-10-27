import type { TokenItem } from "@scryboard/shared";
import { describe, expect, it } from "vitest";
import { partyTokens } from "../vision/sources";
import { partyBounds } from "./projector";

const token = (id: string, x: number, y: number, extra: Partial<TokenItem> = {}): TokenItem => ({
  id,
  kind: "token",
  layer: "token",
  x,
  y,
  rotation: 0,
  z: 0,
  locked: false,
  createdBy: "gm",
  name: id,
  color: "#46a758",
  assetId: null,
  size: 1,
  ...extra,
});

describe("partyTokens", () => {
  it("takes assigned tokens and those created by connected players", () => {
    const items = [
      token("goblin", 0, 0),
      token("aldo", 0, 0, { owners: ["p1"] }),
      token("bruna", 0, 0, { createdBy: "p2" }),
      token("ospite", 0, 0, { createdBy: "p3" }),
    ];
    expect(partyTokens(items, ["p2"]).map((t) => t.id)).toEqual(["aldo", "bruna"]);
  });
});

describe("partyBounds", () => {
  it("frames every party token with three cells of margin", () => {
    expect(partyBounds([], 70)).toBeNull();
    expect(partyBounds([token("a", 100, 100), token("b", 400, 240, { size: 2 })], 70)).toEqual({
      x: 100 - 35 - 210,
      y: 100 - 35 - 210,
      width: 400 + 70 + 210 - (100 - 35 - 210),
      height: 240 + 70 + 210 - (100 - 35 - 210),
    });
  });
});
