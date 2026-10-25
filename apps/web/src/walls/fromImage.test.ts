import { describe, expect, it } from "vitest";
import { parseWallTrace, pickDefaultVisionModel } from "../gemini/walls";
import { projectTrace } from "./fromImage";

const image = { x: 100, y: 200, width: 500, height: 250, rotation: 0 };

describe("projectTrace", () => {
  it("maps the 0-1000 scale onto the image placed in the world", () => {
    const [wall] = projectTrace(
      [
        {
          kind: "wall",
          points: [
            { x: 0, y: 0 },
            { x: 1000, y: 0 },
            { x: 1000, y: 1000 },
          ],
        },
      ],
      image,
    );
    expect(wall).toEqual({ kind: "wall", points: [100, 200, 600, 200, 600, 450] });
  });

  it("rotates around the top-left corner", () => {
    const [wall] = projectTrace(
      [
        {
          kind: "wall",
          points: [
            { x: 0, y: 0 },
            { x: 1000, y: 0 },
          ],
        },
      ],
      { ...image, rotation: 90 },
    );
    expect(wall?.points[2]).toBeCloseTo(100);
    expect(wall?.points[3]).toBeCloseTo(700);
  });

  it("snaps, drops walls that collapse and keeps doors as a single segment", () => {
    const snap = (p: { x: number; y: number }) => ({
      x: Math.round(p.x / 70) * 70,
      y: Math.round(p.y / 70) * 70,
    });
    const drafts = projectTrace(
      [
        {
          kind: "wall",
          points: [
            { x: 10, y: 10 },
            { x: 20, y: 20 },
          ],
        },
        {
          kind: "door",
          points: [
            { x: 0, y: 0 },
            { x: 500, y: 500 },
            { x: 1000, y: 0 },
          ],
        },
      ],
      image,
      snap,
    );
    expect(drafts).toEqual([{ kind: "door", points: [70, 210, 630, 210], door: "closed" }]);
  });
});

describe("parseWallTrace", () => {
  const reply = (walls: unknown) => ({
    candidates: [{ content: { parts: [{ text: JSON.stringify({ walls }) }] } }],
  });

  it("clamps coordinates and drops walls with fewer than two valid points", () => {
    const walls = parseWallTrace(
      reply([
        {
          kind: "wall",
          points: [
            { x: -5, y: 10 },
            { x: 1200, y: 20 },
          ],
        },
        { kind: "wall", points: [{ x: 1, y: 1 }] },
        { kind: "door", points: [{ x: "a", y: 1 }, { x: 5 }] },
      ]),
    );
    expect(walls).toEqual([
      {
        kind: "wall",
        points: [
          { x: 0, y: 10 },
          { x: 1000, y: 20 },
        ],
      },
    ]);
  });

  it("rejects empty and blocked replies", () => {
    expect(() => parseWallTrace({ candidates: [] })).toThrow();
    expect(() => parseWallTrace({ promptFeedback: { blockReason: "SAFETY" } })).toThrow();
  });
});

describe("pickDefaultVisionModel", () => {
  const ids = (...list: string[]) => list.map((id) => ({ id }));

  it("prefers the newest flash model over lite, preview and older ones", () => {
    expect(
      pickDefaultVisionModel(
        ids("gemini-2.5-pro", "gemini-2.5-flash", "gemini-3.1-flash", "gemini-3.1-flash-lite"),
      ),
    ).toBe("gemini-3.1-flash");
  });

  it("falls back to any model, then to the built-in default", () => {
    expect(pickDefaultVisionModel(ids("gemini-2.5-pro"))).toBe("gemini-2.5-pro");
    expect(pickDefaultVisionModel([])).toBe("gemini-2.5-flash");
  });
});
