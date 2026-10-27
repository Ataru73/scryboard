import { describe, expect, it } from "vitest";
import {
  gmLink,
  gmTokenFromHash,
  isProjectorView,
  playerLink,
  projectorLink,
  roomIdFromPath,
} from "./links";

describe("links", () => {
  it("builds player and GM links", () => {
    expect(playerLink("https://x.test", "abc")).toBe("https://x.test/r/abc");
    expect(gmLink("https://x.test", "abc", "t-k_n")).toBe("https://x.test/r/abc#gm=t-k_n");
  });

  it("builds and recognizes the table screen link", () => {
    expect(projectorLink("https://x.test", "abc")).toBe("https://x.test/r/abc?view=projector");
    expect(isProjectorView("?view=projector")).toBe(true);
    expect(isProjectorView("?view=other")).toBe(false);
    expect(isProjectorView("")).toBe(false);
  });

  it("extracts the GM token from the hash", () => {
    expect(gmTokenFromHash("#gm=secret")).toBe("secret");
    expect(gmTokenFromHash("#other=1&gm=secret")).toBe("secret");
    expect(gmTokenFromHash("#gm=")).toBeNull();
    expect(gmTokenFromHash("")).toBeNull();
  });

  it("parses room paths", () => {
    expect(roomIdFromPath("/r/abc_DEF-123")).toBe("abc_DEF-123");
    expect(roomIdFromPath("/r/abc/")).toBe("abc");
    expect(roomIdFromPath("/")).toBeNull();
    expect(roomIdFromPath("/r/abc/extra")).toBeNull();
  });
});
