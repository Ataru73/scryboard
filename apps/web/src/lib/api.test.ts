import { describe, expect, it } from "vitest";
import { ApiRequestError, describeApiError } from "./api";

describe("describeApiError", () => {
  it.each([0, 502, 503, 504])("reports an unreachable server for status %i", (status) => {
    expect(describeApiError(new ApiRequestError(status))).toMatch(/non risponde/);
  });

  it("reports invalid input", () => {
    expect(describeApiError(new ApiRequestError(400))).toMatch(/non validi/);
  });

  it("includes the status for other errors", () => {
    expect(describeApiError(new ApiRequestError(500))).toMatch(/\(500\)/);
    expect(describeApiError(new Error("boom"))).toMatch(/imprevisto/);
  });
});
