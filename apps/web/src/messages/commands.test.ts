import { describe, expect, it } from "vitest";
import { emoteText, messagePreview, parseRollCommand } from "./commands";

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

describe("emoteText", () => {
  it("reads /me actions, keeping line breaks", () => {
    expect(emoteText("/me draws her sword")).toBe("draws her sword");
    expect(emoteText(" /ME nods\nslowly ")).toBe("nods\nslowly");
  });

  it("leaves normal messages alone", () => {
    expect(emoteText("/me")).toBeNull();
    expect(emoteText("/meow")).toBeNull();
    expect(emoteText("hello /me waves")).toBeNull();
  });

  it("previews actions with the author's name", () => {
    expect(messagePreview({ text: "/me waves", fromName: "Aldo" })).toBe("Aldo waves");
    expect(messagePreview({ text: "hi", fromName: "Aldo" })).toBe("hi");
  });
});
