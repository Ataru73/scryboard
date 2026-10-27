import { describe, expect, it } from "vitest";
import {
  deleteGeneratedAsset,
  listGeneratedAssets,
  saveGeneratedAsset,
  subscribeGeneratedAssets,
} from "./generatedAssets";

describe("generatedAssets store", () => {
  it("saves, lists, filters by kind and deletes assets", async () => {
    let notified = 0;
    const unsub = subscribeGeneratedAssets(() => {
      notified++;
    });

    const tokenAsset = {
      id: "token-1.webp",
      kind: "token" as const,
      blob: new Blob(["token-data"], { type: "image/webp" }),
      mimeType: "image/webp",
      prompt: "elfo mago",
      createdAt: "2026-01-01T10:00:00Z",
    };

    const mapAsset = {
      id: "map-1.webp",
      kind: "map" as const,
      blob: new Blob(["map-data"], { type: "image/webp" }),
      mimeType: "image/webp",
      prompt: "dungeon sotterraneo",
      createdAt: "2026-01-02T10:00:00Z",
    };

    const stampAsset = {
      id: "stamp-1.webp",
      kind: "stamp" as const,
      blob: new Blob(["stamp-data"], { type: "image/webp" }),
      mimeType: "image/webp",
      prompt: "forziere",
      createdAt: "2026-01-03T10:00:00Z",
      metadata: { size: 1.5 },
    };

    await saveGeneratedAsset(tokenAsset);
    await saveGeneratedAsset(mapAsset);
    await saveGeneratedAsset(stampAsset);

    expect(notified).toBe(3);

    const all = await listGeneratedAssets();
    // Newest first
    expect(all.map((a) => a.id)).toEqual(["stamp-1.webp", "map-1.webp", "token-1.webp"]);

    const tokens = await listGeneratedAssets("token");
    expect(tokens.map((a) => a.id)).toEqual(["token-1.webp"]);

    const stamps = await listGeneratedAssets("stamp");
    expect(stamps.map((a) => a.id)).toEqual(["stamp-1.webp"]);
    expect(stamps[0]?.metadata?.size).toBe(1.5);

    await deleteGeneratedAsset("map-1.webp");
    expect(notified).toBe(4);
    const afterDelete = await listGeneratedAssets("map");
    expect(afterDelete).toHaveLength(0);

    unsub();
  });
});
