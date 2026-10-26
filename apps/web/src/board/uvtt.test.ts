import { describe, expect, it } from "vitest";
import { isUvttFile, parseUvtt, UvttError, uvttColor, uvttToBoard } from "./uvtt";

// PNG 1x1 trasparente.
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const sample = {
  format: 0.3,
  resolution: {
    map_origin: { x: 1, y: 1 },
    map_size: { x: 10, y: 8 },
    pixels_per_grid: 140,
  },
  line_of_sight: [
    [
      { x: 1, y: 1 },
      { x: 11, y: 1 },
      { x: 11, y: 9 },
    ],
    [{ x: 3, y: 3 }],
  ],
  objects_line_of_sight: [
    [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
    ],
  ],
  portals: [
    {
      position: { x: 4, y: 1 },
      bounds: [
        { x: 3.5, y: 1 },
        { x: 4.5, y: 1 },
      ],
      closed: true,
    },
    {
      bounds: [
        { x: 1, y: 4 },
        { x: 1, y: 5 },
      ],
      closed: false,
    },
  ],
  lights: [{ position: { x: 3, y: 4 }, range: 6, intensity: 1, color: "ffeccd8b" }],
  image: PNG,
};

describe("uvtt", () => {
  it("recognises the file extensions", () => {
    expect(isUvttFile(new File([], "Cripta.dd2vtt"))).toBe(true);
    expect(isUvttFile(new File([], "mappa.UVTT"))).toBe(true);
    expect(isUvttFile(new File([], "mappa.png"))).toBe(false);
  });

  it("reads image, grid, walls, doors and lights relative to the map origin", () => {
    const map = parseUvtt(sample, "Cripta.dd2vtt");
    expect(map.image).toMatchObject({ name: "Cripta.png", type: "image/png" });
    expect(map).toMatchObject({ cols: 10, rows: 8 });
    // La polilinea di un solo punto si scarta; quelle degli oggetti sono muri anch'esse.
    expect(map.walls).toEqual([
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 8 },
      ],
      [
        { x: 4, y: 4 },
        { x: 5, y: 4 },
      ],
    ]);
    expect(map.doors).toEqual([
      {
        points: [
          { x: 2.5, y: 0 },
          { x: 3.5, y: 0 },
        ],
        open: false,
      },
      {
        points: [
          { x: 0, y: 3 },
          { x: 0, y: 4 },
        ],
        open: true,
      },
    ]);
    expect(map.lights).toEqual([{ x: 2, y: 3, range: 6, color: "#eccd8b" }]);
  });

  it("places everything on the board at the current cell size", () => {
    const board = uvttToBoard(parseUvtt(sample, "x.uvtt"), { x: 100, y: 200 }, 50);
    expect(board).toMatchObject({ width: 500, height: 400 });
    expect(board.walls[0]).toEqual({ kind: "wall", points: [100, 200, 600, 200, 600, 600] });
    expect(board.walls[2]).toEqual({
      kind: "door",
      points: [225, 200, 275, 200],
      door: "closed",
    });
    expect(board.walls[3]).toMatchObject({ door: "open" });
    expect(board.lights).toEqual([{ x: 200, y: 350, bright: 3, dim: 6, color: "#eccd8b" }]);
  });

  it("splits very long walls", () => {
    const line = Array.from({ length: 12000 }, (_, i) => ({ x: i / 1000, y: 0 }));
    const board = uvttToBoard(
      parseUvtt(
        { ...sample, line_of_sight: [line], objects_line_of_sight: [], portals: [], lights: [] },
        "x.uvtt",
      ),
      { x: 0, y: 0 },
      10,
    );
    expect(board.walls).toHaveLength(3);
    expect(board.walls.every((w) => w.points.length <= 10000)).toBe(true);
  });

  it("rejects files that are not UVTT maps", () => {
    expect(() => parseUvtt({ hello: 1 }, "x.uvtt")).toThrow(UvttError);
    expect(() => parseUvtt({ ...sample, image: "aGVsbG8=" }, "x.uvtt")).toThrow(UvttError);
  });

  it("converts ARGB colors", () => {
    expect(uvttColor("ff112233")).toBe("#112233");
    expect(uvttColor("#AABBCC")).toBe("#aabbcc");
    expect(uvttColor(undefined)).toBe("#ffe2a8");
  });
});
