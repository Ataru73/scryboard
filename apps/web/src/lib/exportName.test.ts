import { describe, expect, it } from "vitest";
import { exportFileName } from "./exportName";

describe("exportFileName", () => {
  it("adds the local date and strips characters files cannot hold", () => {
    expect(exportFileName("Miniera", new Date(2026, 10, 2, 23, 59))).toBe(
      "Miniera 2026-11-02.scryboard",
    );
    expect(exportFileName('La "torre": piano 1/2', new Date(2026, 0, 5))).toBe(
      "La _torre_ piano 1_2 2026-01-05.scryboard",
    );
    expect(exportFileName(" ", new Date(2026, 0, 5))).toBe("scryboard 2026-01-05.scryboard");
  });
});
