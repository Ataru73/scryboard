import { describe, expect, it } from "vitest";
import { tokenItemSchema } from "./board";
import { applyDamage, hpBandOf, parseDamage, toggleCondition } from "./vitals";

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
