import { describe, expect, it } from "vitest";
import { tokenItemSchema } from "./board";
import {
  addCustomCondition,
  applyDamage,
  hpBandOf,
  parseDamage,
  removeCondition,
  setConditionRounds,
  tickConditions,
  toggleCondition,
  tokenConditionsSchema,
} from "./vitals";

const hp = (value: number, max = 20, temp = 0) => ({ value, max, temp });

describe("hpBandOf", () => {
  it("splits hit points into four bands, bloodied at half", () => {
    expect(hpBandOf(hp(20))).toBe("healthy");
    expect(hpBandOf(hp(11))).toBe("wounded");
    expect(hpBandOf(hp(10))).toBe("bloodied");
    expect(hpBandOf(hp(1))).toBe("bloodied");
    expect(hpBandOf(hp(0))).toBe("down");
    expect(hpBandOf(hp(-5))).toBe("down");
    expect(hpBandOf(hp(3, 3))).toBe("healthy");
  });
});

describe("applyDamage", () => {
  it("spends temporary hit points first", () => {
    expect(applyDamage(hp(20, 20, 5), -3)).toEqual(hp(20, 20, 2));
    expect(applyDamage(hp(20, 20, 5), -8)).toEqual(hp(17, 20, 0));
  });

  it("can go below zero but not past the schema limit", () => {
    expect(applyDamage(hp(4), -10)).toEqual(hp(-6));
    expect(applyDamage(hp(4), -100000)).toEqual(hp(-9999));
  });

  it("heals up to the maximum without touching temporary hit points", () => {
    expect(applyDamage(hp(15, 20, 3), 10)).toEqual(hp(20, 20, 3));
    expect(applyDamage(hp(-4), 6)).toEqual(hp(2));
    expect(applyDamage(hp(12), 2.9)).toEqual(hp(14));
  });
});

describe("parseDamage", () => {
  it("reads damage and healing, treating unsigned numbers as damage", () => {
    expect(parseDamage("-7")).toBe(-7);
    expect(parseDamage(" + 5 ")).toBe(5);
    expect(parseDamage("12")).toBe(-12);
    expect(parseDamage("")).toBeNull();
    expect(parseDamage("2d6")).toBeNull();
    expect(parseDamage("-1.5")).toBeNull();
  });
});

describe("toggleCondition", () => {
  it("adds and removes conditions in catalog order without duplicates", () => {
    const on = toggleCondition(toggleCondition(undefined, "prone", true), "blinded", true);
    expect(on.map((c) => c.id)).toEqual(["blinded", "prone"]);
    expect(toggleCondition(on, "prone", true).map((c) => c.id)).toEqual(["blinded", "prone"]);
    expect(toggleCondition(on, "blinded", false).map((c) => c.id)).toEqual(["prone"]);
  });
});

describe("custom conditions", () => {
  it("need a short label and a color, and stay unique by label", () => {
    const blessed = { id: "custom", label: "Benedetto", color: "#ffc53d" };
    expect(tokenConditionsSchema.safeParse([blessed]).success).toBe(true);
    expect(tokenConditionsSchema.safeParse([{ id: "custom", color: "#ffc53d" }]).success).toBe(
      false,
    );
    expect(tokenConditionsSchema.safeParse([{ ...blessed, label: "x".repeat(25) }]).success).toBe(
      false,
    );
    expect(
      tokenConditionsSchema.safeParse([blessed, { ...blessed, label: "BENEDETTO" }]).success,
    ).toBe(false);
    // Le condizioni del catalogo non hanno etichetta né colore.
    expect(tokenConditionsSchema.safeParse([{ id: "prone", label: "x" }]).success).toBe(false);
  });

  it("are added after catalog ones, up to eight", () => {
    const list = addCustomCondition([{ id: "prone" }], " Benedetto ", "#ffc53d") ?? [];
    expect(list).toEqual([{ id: "prone" }, { id: "custom", label: "Benedetto", color: "#ffc53d" }]);
    expect(toggleCondition(list, "blinded", true).map((c) => c.id)).toEqual([
      "blinded",
      "prone",
      "custom",
    ]);
    expect(addCustomCondition(list, "benedetto", "#ffc53d")).toBeNull();
    expect(addCustomCondition(list, "  ", "#ffc53d")).toBeNull();
    let many = list;
    for (let i = 1; i < 8; i++) many = addCustomCondition(many, `C${i}`, "#46a758") ?? [];
    expect(many.filter((c) => c.id === "custom")).toHaveLength(8);
    expect(addCustomCondition(many, "Nona", "#46a758")).toBeNull();
    expect(removeCondition(many, "custom:benedetto")).toHaveLength(8);
  });
});

describe("condition durations", () => {
  it("are set and cleared by key, and survive toggling on again", () => {
    const list = setConditionRounds([{ id: "prone" }], "prone", 3);
    expect(list).toEqual([{ id: "prone", rounds: 3 }]);
    expect(toggleCondition(list, "prone", true)).toEqual([{ id: "prone", rounds: 3 }]);
    expect(setConditionRounds(list, "prone", null)).toEqual([{ id: "prone" }]);
  });

  it("go down by one and end at zero", () => {
    const { next, expired } = tickConditions([
      { id: "prone", rounds: 1 },
      { id: "poisoned", rounds: 3 },
      { id: "custom", label: "Benedetto", color: "#ffc53d" },
    ]);
    expect(next).toEqual([
      { id: "poisoned", rounds: 2 },
      { id: "custom", label: "Benedetto", color: "#ffc53d" },
    ]);
    expect(expired).toEqual([{ id: "prone", rounds: 1 }]);
  });
});

describe("token vitals fields", () => {
  const token = {
    id: "t",
    kind: "token",
    layer: "token",
    x: 0,
    y: 0,
    rotation: 0,
    z: 0,
    locked: false,
    createdBy: "u",
    name: "Goblin",
    color: "#46a758",
    assetId: null,
    size: 1,
  };

  it("are optional, so older tokens stay valid", () => {
    expect(tokenItemSchema.safeParse(token).success).toBe(true);
  });

  it("validate hit points and conditions", () => {
    const ok = { ...token, hp: hp(7, 7, 2), hpVisibility: "band", hpBand: "healthy" };
    expect(tokenItemSchema.safeParse(ok).success).toBe(true);
    expect(tokenItemSchema.safeParse({ ...token, hp: hp(1, 0) }).success).toBe(false);
    expect(tokenItemSchema.safeParse({ ...token, hp: hp(1.5) }).success).toBe(false);
    expect(
      tokenItemSchema.safeParse({ ...token, conditions: [{ id: "prone", rounds: 3 }] }).success,
    ).toBe(true);
    expect(tokenItemSchema.safeParse({ ...token, conditions: [{ id: "flying" }] }).success).toBe(
      false,
    );
  });
});
