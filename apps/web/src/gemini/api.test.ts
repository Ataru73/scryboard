import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPrompt,
  GeminiError,
  generateImage,
  generateVariants,
  parseImages,
  testKey,
} from "./api";

const image = (data: string) => ({ inlineData: { mimeType: "image/png", data } });
const ok = (parts: unknown[]) => ({ candidates: [{ finishReason: "STOP", content: { parts } }] });

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("buildPrompt", () => {
  it("combines the description with the style template and the framing rules", () => {
    const prompt = buildPrompt("  goblin con l'arco  ", "bust");
    expect(prompt).toContain("goblin con l'arco.");
    expect(prompt).toContain("head and shoulders");
    expect(prompt).toContain("no text");
    expect(prompt).toContain("cropping into a circle");
    expect(buildPrompt("lupo", "top")).toContain("Top-down");
  });
});

describe("parseImages", () => {
  it("returns every inline image and ignores text parts", () => {
    const images = parseImages(ok([{ text: "ecco" }, image("AAA"), image("BBB")]));
    expect(images).toEqual([
      { mimeType: "image/png", data: "AAA" },
      { mimeType: "image/png", data: "BBB" },
    ]);
  });

  it("reports blocked prompts and safety stops as refusals", () => {
    expect(() => parseImages({ promptFeedback: { blockReason: "PROHIBITED_CONTENT" } })).toThrow(
      expect.objectContaining({ code: "blocked" }),
    );
    expect(() => parseImages({ candidates: [{ finishReason: "IMAGE_SAFETY" }] })).toThrow(
      expect.objectContaining({ code: "blocked" }),
    );
  });

  it("fails on a response without images", () => {
    expect(() => parseImages(ok([{ text: "non posso" }]))).toThrow(GeminiError);
    expect(() => parseImages(null)).toThrow(GeminiError);
  });
});

describe("requests", () => {
  const opts = { apiKey: "k", model: "m/odel", prompt: "p" };

  it("posts to generateContent with the key in a header, not in the URL", async () => {
    const fetchMock = mockFetch(200, ok([image("AAA")]));
    expect(await generateImage(opts)).toEqual({ mimeType: "image/png", data: "AAA" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/m%2Fodel:generateContent",
    );
    expect(url).not.toContain("k");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("k");
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[0].text).toBe("p");
    expect(body.generationConfig.responseModalities).toEqual(["IMAGE"]);
  });

  it("maps HTTP errors to clear codes", async () => {
    mockFetch(400, { error: { message: "API key not valid. Please pass a valid API key." } });
    await expect(generateImage(opts)).rejects.toMatchObject({ code: "invalid-key" });
    mockFetch(429, { error: { status: "RESOURCE_EXHAUSTED", message: "quota" } });
    await expect(generateImage(opts)).rejects.toMatchObject({ code: "quota" });
    mockFetch(404, { error: { message: "not found" } });
    await expect(generateImage(opts)).rejects.toMatchObject({ code: "not-found" });
    mockFetch(500, null);
    await expect(generateImage(opts)).rejects.toMatchObject({ code: "other" });
  });

  it("reports an unreachable network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("failed");
      }),
    );
    await expect(generateImage(opts)).rejects.toMatchObject({ code: "network" });
  });

  it("keeps the variants that succeed and fails only when none does", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        n++ === 1
          ? new Response("{}", { status: 429 })
          : new Response(JSON.stringify(ok([image(`I${n}`)])), { status: 200 }),
      ),
    );
    expect(await generateVariants(opts, 3)).toHaveLength(2);
    mockFetch(429, {});
    await expect(generateVariants(opts, 2)).rejects.toMatchObject({ code: "quota" });
  });

  it("tests the key by reading the model, which generates nothing", async () => {
    const fetchMock = mockFetch(200, { name: "models/m" });
    await testKey("k", "m");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/m");
    expect(init?.method).toBeUndefined();
  });
});
