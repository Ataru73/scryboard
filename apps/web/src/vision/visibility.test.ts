import type { BoardItem, Door, TokenItem, Wall } from "@scryboard/shared";
import { describe, expect, it } from "vitest";
import { isDoorSeen, isPointVisible, lightSources, viewerTokens, visionSources } from "./sources";
import { pointInPolygon, sightGeometry, sightSegments, visibilityPolygon } from "./visibility";

const wall = (points: number[], extra: Partial<Wall> = {}) =>
  ({ id: "w", kind: "wall", points, ...extra }) as Wall;

describe("visibility polygon", () => {
  it("sees everything inside an empty bounded area", () => {
    const poly = visibilityPolygon({ x: 0, y: 0 }, new Float64Array(), 100);
    expect(pointInPolygon({ x: 90, y: 90 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 200, y: 0 }, poly)).toBe(false);
  });

  it("is blocked by walls but sees around their ends", () => {
    // Muro verticale a x = 50, da y = -20 a y = 20.
    const segments = sightSegments([wall([50, -20, 50, 20])]);
    const poly = visibilityPolygon({ x: 0, y: 0 }, segments);
    expect(pointInPolygon({ x: 40, y: 0 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 100, y: 0 }, poly)).toBe(false);
    expect(pointInPolygon({ x: 100, y: 100 }, poly)).toBe(true);
  });

  it("ignores windows, invisible walls and open doors", () => {
    const segments = sightSegments([
      wall([50, -20, 50, 20], { kind: "window" }),
      { id: "d", kind: "door", points: [60, -20, 60, 20], door: "open" } as Wall,
    ]);
    expect(segments.length).toBe(0);
  });

  it("keeps seeing from a token standing against a wall", () => {
    const segments = sightSegments([wall([0, -50, 0, 50])]);
    const poly = visibilityPolygon({ x: 0.0, y: 0 }, segments, 100);
    expect(poly.length).toBeGreaterThan(6);
  });
});

describe("one-way walls", () => {
  // Il muro scende da (50, -20) a (50, 20): chi sta a ovest (x minore) è sul lato che blocca.
  const cliff = [wall([50, -20, 50, 20], { kind: "one-way" })];

  it("blocks sight from the opaque side and lets it through from the other", () => {
    const geometry = sightGeometry(cliff);
    const fromBelow = visibilityPolygon({ x: 0, y: 0 }, geometry, 300);
    expect(pointInPolygon({ x: 100, y: 0 }, fromBelow)).toBe(false);
    const fromAbove = visibilityPolygon({ x: 100, y: 0 }, geometry, 300);
    expect(pointInPolygon({ x: 0, y: 0 }, fromAbove)).toBe(true);
  });

  it("reverses when the wall is drawn the other way", () => {
    const reversed = sightGeometry([wall([50, 20, 50, -20], { kind: "one-way" })]);
    expect(pointInPolygon({ x: 100, y: 0 }, visibilityPolygon({ x: 0, y: 0 }, reversed, 300))).toBe(
      true,
    );
    expect(pointInPolygon({ x: 0, y: 0 }, visibilityPolygon({ x: 100, y: 0 }, reversed, 300))).toBe(
      false,
    );
  });
});

describe("terrain walls", () => {
  // Una colonna di 20 × 20 con il centro in (60, 0).
  const pillar = sightGeometry([
    wall([50, -10, 70, -10, 70, 10, 50, 10, 50, -10], { kind: "terrain" }),
  ]);

  it("shows the front face but not what is behind the pillar", () => {
    const poly = visibilityPolygon({ x: 0, y: 0 }, pillar, 300);
    expect(pointInPolygon({ x: 40, y: 0 }, poly)).toBe(true);
    expect(pointInPolygon({ x: 60, y: 0 }, poly)).toBe(true); // dentro la colonna
    expect(pointInPolygon({ x: 120, y: 0 }, poly)).toBe(false); // dietro
    expect(pointInPolygon({ x: 120, y: 80 }, poly)).toBe(true); // di lato
  });

  it("does not block on its own when only one terrain wall is in the way", () => {
    const single = sightGeometry([wall([50, -20, 50, 20], { kind: "terrain" })]);
    expect(pointInPolygon({ x: 100, y: 0 }, visibilityPolygon({ x: 0, y: 0 }, single, 300))).toBe(
      true,
    );
  });
});

const token = (id: string, extra: Partial<TokenItem> = {}): TokenItem => ({
  id,
  kind: "token",
  layer: "token",
  x: 0,
  y: 0,
  rotation: 0,
  z: 0,
  locked: false,
  createdBy: "gm",
  name: id,
  color: "#000000",
  assetId: null,
  size: 1,
  ...extra,
});

describe("vision sources and visibility", () => {
  it("lets players see through tokens they created or were assigned", () => {
    const items: BoardItem[] = [
      token("mine", { createdBy: "p1" }),
      token("assigned", { owners: ["p1"] }),
      token("monster"),
    ];
    expect(viewerTokens(items, "p1").map((t) => t.id)).toEqual(["mine", "assigned"]);
  });

  it("collects fixed lights and lights carried by tokens, in world pixels", () => {
    const items: BoardItem[] = [
      token("torchbearer", { light: { bright: 4, dim: 8, color: "#ffb35c" } }),
      {
        ...token("x"),
        id: "lamp",
        kind: "light",
        layer: "map",
        bright: 2,
        dim: 4,
        color: "#ffffff",
      } as BoardItem,
    ];
    expect(lightSources(items, 10).map((l) => [l.id, l.bright, l.dim])).toEqual([
      ["light:torchbearer", 40, 80],
      ["light:lamp", 20, 40],
    ]);
  });

  it("needs light or darkvision at night, only line of sight by day", () => {
    const viewer = visionSources([token("hero", { vision: { range: 0, darkvision: 6 } })], 10);
    const lights = [{ id: "lamp", x: 200, y: 0, bright: 20, dim: 40, color: "#fff" }];
    const segments = new Float64Array();
    const polygons = new Map([
      ["hero", visibilityPolygon({ x: 0, y: 0 }, segments)],
      ["lamp", visibilityPolygon({ x: 200, y: 0 }, segments, 40)],
    ]);
    const visible = (x: number, ambient: "day" | "night") =>
      isPointVisible({ x, y: 0 }, viewer, lights, polygons, ambient);
    expect(visible(500, "day")).toBe(true);
    expect(visible(500, "night")).toBe(false);
    expect(visible(50, "night")).toBe(true); // scurovisione 60 px
    expect(visible(210, "night")).toBe(true); // illuminato dalla lampada
  });
});

describe("isDoorSeen", () => {
  it("sees a closed door from either side, even though it blocks sight", () => {
    const door: Door = { id: "d", kind: "door", points: [50, -20, 50, 20], door: "closed" };
    const poly = visibilityPolygon({ x: 0, y: 0 }, sightSegments([door]));
    const seen = (p: { x: number; y: number }) => pointInPolygon(p, poly);
    expect(seen({ x: 50, y: 0 })).toBe(false);
    expect(isDoorSeen(door, seen)).toBe(true);
    expect(isDoorSeen(door, () => false)).toBe(false);
  });
});
