import { describe, expect, it } from "vitest";
import { parseRoomDocumentName, roomDocumentName } from "./documents";

describe("room document names", () => {
  it("round-trips room id and scope", () => {
    const name = roomDocumentName("abc123DEF_-", "gm");
    expect(name).toBe("room:abc123DEF_-:gm");
    expect(parseRoomDocumentName(name)).toEqual({ roomId: "abc123DEF_-", scope: "gm" });
  });

  it.each(["room:abc", "room:abc:private", "other:abc:public", "room:a/b:public", ""])(
    "rejects %j",
    (name) => {
      expect(parseRoomDocumentName(name)).toBeNull();
    },
  );
});
