import { rollDice } from "@scryboard/shared";
import { describe, expect, it } from "vitest";
import { naturalD20 } from "./RollPanel";

const fixed = (...values: number[]) => {
  let i = 0;
  return () => values[i++] as number;
};

describe("naturalD20", () => {
  it("spots natural 20s and 1s on the d20s that count", () => {
    expect(naturalD20(rollDice("1d20+5", fixed(20)))).toBe("crit");
    expect(naturalD20(rollDice("1d20+5", fixed(1)))).toBe("fumble");
    expect(naturalD20(rollDice("1d20+5", fixed(12)))).toBeNull();
    // Con vantaggio l'1 scartato non conta.
    expect(naturalD20(rollDice("2d20kh1", fixed(1, 15)))).toBeNull();
    expect(naturalD20(rollDice("2d20kl1", fixed(1, 20)))).toBe("fumble");
  });

  it("ignores other dice and success pools", () => {
    expect(naturalD20(rollDice("1d12", fixed(12)))).toBeNull();
    expect(naturalD20(rollDice("3d20>=15", fixed(20, 1, 3)))).toBeNull();
  });
});
