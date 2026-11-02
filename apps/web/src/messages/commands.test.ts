import { describe, expect, it } from "vitest";
import { parseRollCommand } from "./commands";

describe("parseRollCommand", () => {
  it("reads public rolls with /r and /roll", () => {
    expect(parseRollCommand("/r 2d6+1", false)).toEqual({ formula: "2d6+1", hidden: false });
    expect(parseRollCommand("  /ROLL  1d20 ", false)).toEqual({ formula: "1d20", hidden: false });
  });

  it("reads secret rolls only for the GM", () => {
    expect(parseRollCommand("/gr 1d20", true)).toEqual({ formula: "1d20", hidden: true });
    expect(parseRollCommand("/gmroll 3d6", true)).toEqual({ formula: "3d6", hidden: true });
    expect(parseRollCommand("/gr 1d20", false)).toBeNull();
  });

  it("leaves ordinary messages alone", () => {
    expect(parseRollCommand("ciao", true)).toBeNull();
    expect(parseRollCommand("/r", true)).toBeNull();
    expect(parseRollCommand("/rolling 1d6", true)).toBeNull();
    expect(parseRollCommand("guarda /r 1d6", true)).toBeNull();
  });
});
