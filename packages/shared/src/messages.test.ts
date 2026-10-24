import { describe, expect, it } from "vitest";
import { mailDocumentName, parseRoomDocumentName } from "./documents";
import { parsePlayerCredentials, playerCredentials, sendMessageRequestSchema } from "./messages";

describe("mailboxes and messages", () => {
  it("names and parses mailbox documents", () => {
    expect(mailDocumentName("abcdefghijkl", "gm")).toBe("room:abcdefghijkl:mail:gm");
    expect(parseRoomDocumentName("room:abcdefghijkl:mail:0123abcd")).toEqual({
      roomId: "abcdefghijkl",
      scope: "mail",
      mailbox: "0123abcd",
    });
    expect(parseRoomDocumentName("room:abcdefghijkl:mail:NOTHEX!")).toBeNull();
    expect(parseRoomDocumentName("room:abcdefghijkl:public")).toEqual({
      roomId: "abcdefghijkl",
      scope: "public",
    });
  });

  it("round-trips player credentials and rejects malformed ones", () => {
    const value = playerCredentials("0123abcd", "s3cret_token_value-1");
    expect(parsePlayerCredentials(value)).toEqual({
      profileId: "0123abcd",
      secret: "s3cret_token_value-1",
    });
    expect(parsePlayerCredentials("0123abcd:short")).toBeNull();
    expect(parsePlayerCredentials("gm:whatever-whatever")).toBeNull();
  });

  it("validates outgoing messages", () => {
    expect(
      sendMessageRequestSchema.safeParse({ to: "gm", text: "  Ciao ", fromName: "Arwen" }).data
        ?.text,
    ).toBe("Ciao");
    expect(
      sendMessageRequestSchema.safeParse({ to: "gm", text: "   ", fromName: "Arwen" }).success,
    ).toBe(false);
    expect(
      sendMessageRequestSchema.safeParse({ to: "nope", text: "x", fromName: "Arwen" }).success,
    ).toBe(false);
  });
});
