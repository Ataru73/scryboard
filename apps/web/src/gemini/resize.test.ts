import { describe, expect, it } from "vitest";
import { cutoutBackground } from "./resize";

describe("cutoutBackground", () => {
  it("makes white border pixels transparent while preserving isolated interior white pixels", () => {
    // 5x5 image
    // Border is white (255, 255, 255, 255)
    // Ring of black (0, 0, 0, 255)
    // Center pixel is white (255, 255, 255, 255) inside the black ring
    const width = 5;
    const height = 5;
    const data = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const isBorder = x === 0 || x === 4 || y === 0 || y === 4;
        const isCenter = x === 2 && y === 2;
        if (isBorder || isCenter) {
          // White
          data[idx] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 255;
          data[idx + 3] = 255;
        } else {
          // Black
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 255;
        }
      }
    }

    cutoutBackground({ data, width, height });

    // Border (0,0) must now be transparent (alpha = 0)
    expect(data[0 * 4 + 3]).toBe(0);
    // Ring pixel (1,1) must remain fully opaque black (alpha = 255)
    expect(data[(1 * width + 1) * 4 + 3]).toBe(255);
    // Center pixel (2,2) enclosed by the black ring must remain fully opaque white (alpha = 255)
    expect(data[(2 * width + 2) * 4 + 3]).toBe(255);
    expect(data[(2 * width + 2) * 4]).toBe(255);
  });
});
