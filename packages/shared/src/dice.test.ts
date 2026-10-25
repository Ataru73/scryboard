import { describe, expect, it } from "vitest";
import { DiceError, describeRoll, formatDice, parseDice, rollDice } from "./dice";

/** Dadi truccati: restituiscono i valori in sequenza. */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++] as number;
};

describe("parseDice", () => {
  it("reads dice, modifiers and constants", () => {
    expect(formatDice(parseDice("2d20kh1+5"))).toBe("2d20kh1+5");
    expect(formatDice(parseDice(" D6 + 2D8 - 1 "))).toBe("1d6+2d8-1");
    expect(formatDice(parseDice("d%"))).toBe("1d100");
    expect(formatDice(parseDice("4d6dl1"))).toBe("4d6dl1");
    expect(formatDice(parseDice("2d20k"))).toBe("2d20kh1");
  });

  it("rejects what it cannot read or what is excessive", () => {
    for (const bad of [
      "",
      "abc",
      "2d",
      "d1",
      "0d6",
      "101d6",
      "1d1001",
      "2d6+",
      "++3",
      "3d6kh4",
      "2d6dl2",
    ]) {
      expect(() => parseDice(bad), bad).toThrow(DiceError);
    }
    expect(() => parseDice("1d6".repeat(2) + "+1".repeat(30))).toThrow(DiceError);
  });
});

describe("rollDice", () => {
  it("sums dice and constants", () => {
    const roll = rollDice("2d6+3", sequence(4, 5));
    expect(roll.total).toBe(12);
    expect(roll.formula).toBe("2d6+3");
  });

  it("keeps the highest or lowest, and drops dice", () => {
    expect(rollDice("2d20kh1+5", sequence(7, 18)).total).toBe(23);
    expect(rollDice("2d20kl1", sequence(7, 18)).total).toBe(7);
    const drop = rollDice("4d6dl1", sequence(3, 6, 2, 5));
    expect(drop.total).toBe(14);
    expect(drop.terms[0]).toMatchObject({ kept: [true, true, false, true] });
  });

  it("subtracts terms with a minus sign", () => {
    expect(rollDice("1d8-1d4-2", sequence(6, 3)).total).toBe(1);
  });

  it("describes a roll for the log", () => {
    expect(describeRoll(rollDice("2d20kh1+5", sequence(7, 18)))).toBe("2d20 [~7, 18] + 5 = 23");
  });
});
