import { describe, expect, it } from "vitest";
import { metaDocumentName, parseRoomDocumentName, roomDocumentName } from "./documents";

describe("room document names", () => {
  it("round-trips room id and scope", () => {
    const name = roomDocumentName("abc123DEF_-", "gm");
    expect(name).toBe("room:abc123DEF_-:gm");
    expect(parseRoomDocumentName(name)).toEqual({
      roomId: "abc123DEF_-",
      scope: "gm",
      sceneId: "main",
    });
  });

  it("names the documents of other scenes and of the room", () => {
    const name = roomDocumentName("room12345678", "public", "k3j9x0ab12");
    expect(name).toBe("room:room12345678:s:k3j9x0ab12:public");
    expect(parseRoomDocumentName(name)).toEqual({
      roomId: "room12345678",
      scope: "public",
      sceneId: "k3j9x0ab12",
    });
    expect(roomDocumentName("room12345678", "gm", "main")).toBe("room:room12345678:gm");
    expect(parseRoomDocumentName(metaDocumentName("room12345678"))).toEqual({
      roomId: "room12345678",
      scope: "meta",
      sceneId: "main",
    });
  });

  it.each(["room:abc:s:SHORT:public", "room:abc:s:k3j9x0ab12:meta", "room:abc:s:k3j9x0ab12"])(
    "rejects scene names like %j",
    (name) => {
      expect(parseRoomDocumentName(name)).toBeNull();
    },
  );

  it.each(["room:abc", "room:abc:private", "other:abc:public", "room:a/b:public", ""])(
    "rejects %j",
    (name) => {
      expect(parseRoomDocumentName(name)).toBeNull();
    },
  );
});
