import { describe, expect, it } from "vitest";
import { DiceError, describeRoll, formatDice, parseDice, rollDice, rollSchema } from "./dice";

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

describe("exploding dice and success pools", () => {
  it("parses and normalises the new modifiers", () => {
    expect(formatDice(parseDice("10d10!>=7"))).toBe("10d10!>=7");
    expect(formatDice(parseDice("1d10!"))).toBe("1d10!");
    expect(formatDice(parseDice("3d6!5+2"))).toBe("3d6!5+2");
    expect(formatDice(parseDice("6d6>4"))).toBe("6d6>4");
    expect(formatDice(parseDice("4d6kh3!6>=5"))).toBe("4d6kh3!>=5");
    expect(formatDice(parseDice(" 5D10 !  >= 8 "))).toBe("5d10!>=8");
    expect(formatDice(parseDice("1d10!10"))).toBe("1d10!"); // esplodere sul massimo è «!»
  });

  it("rejects thresholds that make no sense", () => {
    for (const bad of ["1d10!1", "1d10!11", "5d10>=0", "5d10>=11", "5d10>=", "2d6>=3!", "1d6!!"]) {
      expect(() => parseDice(bad), bad).toThrow(DiceError);
    }
  });

  it("rolls an extra die for each one that reaches the threshold, in chains", () => {
    const roll = rollDice("2d6!", sequence(6, 3, 4));
    expect(roll.total).toBe(13);
    expect(roll.terms[0]).toMatchObject({ dice: [6, 3, 4], extra: [false, false, true] });
    const chain = rollDice("1d6!", sequence(6, 6, 6, 2));
    expect(chain.total).toBe(20);
    expect(chain.terms[0]).toMatchObject({ dice: [6, 6, 6, 2], extra: [false, true, true, true] });
    expect(rollDice("1d6!5", sequence(5, 1)).total).toBe(6);
  });

  it("stops exploding after a hundred extra dice", () => {
    const roll = rollDice("1d2!", () => 2);
    expect(roll.terms[0]).toMatchObject({ kind: "dice" });
    expect((roll.terms[0] as { dice: number[] }).dice).toHaveLength(101);
    expect(roll.total).toBe(202);
  });

  it("counts successes instead of summing", () => {
    const pool = rollDice("5d10>=7", sequence(8, 3, 7, 10, 6));
    expect(pool.total).toBe(3);
    expect(pool.terms[0]).toMatchObject({ successes: 3, success: { op: ">=", value: 7 } });
    expect(rollDice("5d10<=3", sequence(8, 3, 1, 10, 6)).total).toBe(2);
    expect(rollDice("4d6=6", sequence(6, 2, 6, 6)).total).toBe(3);
    expect(rollDice("3d6>4", sequence(5, 4, 6)).total).toBe(2);
  });

  it("counts explosions in the pool and ignores dropped dice", () => {
    // 3d10 esplode sul 10: [10, 4, 9] + un 8 dal 10 → con soglia 8 i successi sono 10, 9 e 8.
    const exploding = rollDice("3d10!>=8", sequence(10, 4, 9, 8));
    expect(exploding.total).toBe(3);
    // Si tengono i due migliori su quattro: 6 e 5 superano il 4, 1 e 2 sono scartati.
    expect(rollDice("4d6kh2>=4", sequence(6, 1, 5, 2)).total).toBe(2);
  });

  it("mixes pools with constants and other terms", () => {
    expect(rollDice("5d10>=7+2", sequence(8, 8, 1, 1, 1)).total).toBe(4);
    expect(rollDice("1d6-3d10>=6", sequence(4, 6, 7, 1)).total).toBe(2);
  });

  it("describes explosions and successes for the log", () => {
    expect(describeRoll(rollDice("3d10!>=8", sequence(10, 4, 9, 8)))).toBe(
      "3d10!>=8 [10, 4, 9, *8] → 3 = 3",
    );
    expect(describeRoll(rollDice("2d6!+1", sequence(6, 3, 2)))).toBe("2d6! [6, 3, *2] + 1 = 12");
  });

  it("produces rolls the shared schema accepts", () => {
    const rolled = rollDice("4d10!>=8", sequence(10, 3, 9, 1, 5));
    const roll = rollSchema.parse({
      id: "r",
      from: "gm",
      name: "GM",
      ...rolled,
      at: new Date().toISOString(),
    });
    expect(roll.total).toBe(rolled.total);
  });
});
