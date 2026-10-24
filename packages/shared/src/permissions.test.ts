import { describe, expect, it } from "vitest";
import type { BoardItem } from "./board";
import { canModify, canSelect } from "./permissions";

const token = (layer: BoardItem["layer"], locked: boolean) =>
  ({
    id: "t",
    kind: "token",
    layer,
    locked,
    x: 0,
    y: 0,
    z: 0,
    rotation: 0,
    createdBy: "u",
    name: "",
    color: "#000000",
    assetId: null,
    size: 1,
  }) as BoardItem;

describe("permissions", () => {
  it("lets the GM select everything but modify only unlocked items", () => {
    expect(canSelect(token("map", true), "gm")).toBe(true);
    expect(canModify(token("map", true), "gm")).toBe(false);
    expect(canModify(token("map", false), "gm")).toBe(true);
  });

  it("keeps players away from the map layer and locked items", () => {
    expect(canSelect(token("map", false), "player")).toBe(false);
    expect(canSelect(token("token", true), "player")).toBe(false);
    expect(canModify(token("token", false), "player")).toBe(true);
    expect(canModify(undefined, "player")).toBe(false);
  });
});
