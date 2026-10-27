import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMapPrompt,
  buildPrompt,
  buildStampPrompt,
  GeminiError,
  generateImage,
  generateVariants,
  listImageModels,
  parseImages,
  pickImageModels,
  pickVisionModels,
} from "./api";

const image = (data: string) => ({ inlineData: { mimeType: "image/png", data } });
const ok = (parts: unknown[]) => ({ candidates: [{ finishReason: "STOP", content: { parts } }] });

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("buildMapPrompt", () => {
  it("asks for a top-down map without characters or text, or a parchment for regions", () => {
    const dungeon = buildMapPrompt("  cripta con altare  ", "dungeon");
    expect(dungeon).toContain("cripta con altare.");
    expect(dungeon).toContain("Top-down battle map");
    expect(dungeon).toContain("no grid lines");
    expect(dungeon).toContain("no characters");
    expect(buildMapPrompt("isola", "region")).toContain("parchment");
  });
});

describe("buildStampPrompt", () => {
  it("asks for an isolated top-down prop/stamp on a plain white background", () => {
    const chest = buildStampPrompt("  forziere dorato  ", "prop");
    expect(chest).toContain("forziere dorato.");
    expect(chest).toContain("Top-down");
    expect(chest).toContain("isolated on a plain solid white background");
    expect(chest).toContain("no floor");
    expect(buildStampPrompt("albero", "nature")).toContain("nature element");
    expect(buildStampPrompt("portale", "magic")).toContain("magical circle");
    expect(buildStampPrompt("altare", "structure")).toContain("architectural element");
  });
});

describe("generateImage aspect ratio", () => {
  it("sends the requested aspect ratio, square by default", async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(init.body as string);
        return new Response(JSON.stringify(ok([image("AAAA")])), { status: 200 });
      }),
    );
    await generateImage({ apiKey: "k", model: "m", prompt: "p", aspectRatio: "16:9" });
    await generateImage({ apiKey: "k", model: "m", prompt: "p" });
    const ratios = bodies.map((b) => JSON.parse(b).generationConfig.imageConfig.aspectRatio);
    expect(ratios).toEqual(["16:9", "1:1"]);
  });
});

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
});

const model = (name: string, methods: string[] = ["generateContent"], displayName?: string) => ({
  name: `models/${name}`,
  displayName,
  supportedGenerationMethods: methods,
});

describe("image models", () => {
  it("keeps the generateContent models that make images", () => {
    const picked = pickImageModels({
      models: [
        model("gemini-3.1-flash-image", ["generateContent"], "Nano Banana 2"),
        model("gemini-nano-banana-2.1"),
        model("gemini-3.1-flash"),
        model("imagen-4.0-generate", ["predict"]),
        model("gemini-2.5-flash-image", ["countTokens"]),
        { displayName: "senza nome" },
      ],
    });
    expect(picked).toEqual([
      { id: "gemini-3.1-flash-image", displayName: "Nano Banana 2" },
      { id: "gemini-nano-banana-2.1", displayName: "gemini-nano-banana-2.1" },
    ]);
    expect(pickImageModels(null)).toEqual([]);
  });

  it("keeps only text models that read images for the wall tracing", () => {
    const picked = pickVisionModels({
      models: [
        model("gemini-3.1-flash", ["generateContent"], "Gemini Flash"),
        model("gemini-3.1-flash-image"),
        model("gemini-nano-banana-2.1"),
        model("gemini-3.1-flash-tts"),
        model("gemini-live-3"),
        model("gemini-embedding-001", ["embedContent"]),
        model("imagen-4.0-generate", ["predict"]),
        model("gemma-3-27b"),
      ],
    });
    expect(picked).toEqual([{ id: "gemini-3.1-flash", displayName: "Gemini Flash" }]);
  });

  it("follows the pages and sends the key as a header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ models: [model("a-image")], nextPageToken: "t 2" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ models: [model("b-image")] }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    expect((await listImageModels("k")).map((m) => m.id)).toEqual(["a-image", "b-image"]);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls[0]).toBe("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000");
    expect(urls[1]).toContain("pageToken=t%202");
    expect(urls.join()).not.toContain("key=");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("k");
  });

  it("rejects a wrong key", async () => {
    mockFetch(400, { error: { message: "API key not valid." } });
    await expect(listImageModels("x")).rejects.toMatchObject({ code: "invalid-key" });
  });
});
