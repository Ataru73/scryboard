import { roomDocumentName } from "@scryboard/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detectAssetType, detectImageType } from "../src/assets/store";
import { parseByteRange } from "../src/http/app";
import { connect, createRoom, startTestServer, type TestServer, tempDatabasePath } from "./helpers";

// PNG 1x1 trasparente.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

describe("detectImageType", () => {
  it("recognises formats by magic bytes", () => {
    expect(detectImageType(PNG)).toBe("image/png");
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectImageType(Buffer.from("GIF89a"))).toBe("image/gif");
    expect(detectImageType(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(detectImageType(Buffer.from("<svg></svg>"))).toBeNull();
  });
});

// Intestazioni minime di un MP4 («ftyp») e di un WebM (EBML), seguite da dati qualsiasi.
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from("ftypmp42"),
  Buffer.alloc(40, 7),
]);
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(40, 9)]);

describe("video detection and ranges", () => {
  it("recognises videos by signature, and still rejects text", () => {
    expect(detectAssetType(MP4)).toBe("video/mp4");
    expect(detectAssetType(WEBM)).toBe("video/webm");
    expect(detectAssetType(PNG)).toBe("image/png");
    expect(detectAssetType(Buffer.from("not a video at all"))).toBeNull();
    expect(detectImageType(MP4)).toBeNull();
  });

  it("parses single byte ranges", () => {
    expect(parseByteRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseByteRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange("bytes=50-500", 100)).toEqual({ start: 50, end: 99 });
    expect(parseByteRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=9-3", 100)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=0-1,5-6", 100)).toBeNull();
    expect(parseByteRange(undefined, 100)).toBeNull();
  });
});

describe("assets API", () => {
  let server: TestServer;
  let cleanup: () => void;

  beforeAll(async () => {
    const db = tempDatabasePath();
    cleanup = db.cleanup;
    server = await startTestServer(db.path);
  });
  afterAll(async () => {
    await server.stop();
    cleanup();
  });

  const upload = (roomId: string, body: Uint8Array | string) =>
    fetch(`${server.baseUrl}/api/rooms/${roomId}/assets`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body,
    });

  it("stores an image and serves it back with immutable caching", async () => {
    const room = await createRoom(server);
    const res = await upload(room.id, PNG);
    expect(res.status).toBe(201);
    const { assetId } = (await res.json()) as { assetId: string };
    expect(assetId).toMatch(/^[0-9a-f]{64}\.png$/);

    const get = await fetch(`${server.baseUrl}/api/rooms/${room.id}/assets/${assetId}`);
    expect(get.status).toBe(200);
    expect(get.headers.get("content-type")).toBe("image/png");
    expect(get.headers.get("cache-control")).toContain("immutable");
    expect(Buffer.from(await get.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it("lets only the GM upload videos, and serves them in ranges", async () => {
    const room = await createRoom(server);
    const base = `${server.baseUrl}/api/rooms/${room.id}/assets`;
    expect((await fetch(base, { method: "POST", body: MP4 })).status).toBe(403);
    const res = await fetch(base, {
      method: "POST",
      headers: { authorization: `Bearer ${room.gmToken}` },
      body: MP4,
    });
    expect(res.status).toBe(201);
    const { assetId } = (await res.json()) as { assetId: string };
    expect(assetId).toMatch(/^[0-9a-f]{64}\.mp4$/);

    const gm = { authorization: `Bearer ${room.gmToken}` };
    const whole = await fetch(`${base}/${assetId}`, { headers: gm });
    expect(whole.status).toBe(200);
    expect(whole.headers.get("content-type")).toBe("video/mp4");
    expect(whole.headers.get("accept-ranges")).toBe("bytes");

    const part = await fetch(`${base}/${assetId}`, { headers: { ...gm, range: "bytes=4-7" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 4-7/${MP4.length}`);
    expect(Buffer.from(await part.arrayBuffer()).toString()).toBe("ftyp");
    const tail = await fetch(`${base}/${assetId}`, { headers: { ...gm, range: "bytes=-4" } });
    expect(Buffer.from(await tail.arrayBuffer()).equals(MP4.subarray(MP4.length - 4))).toBe(true);
    const beyond = await fetch(`${base}/${assetId}`, { headers: { ...gm, range: "bytes=999-" } });
    expect(beyond.status).toBe(416);
    expect(beyond.headers.get("content-range")).toBe(`bytes */${MP4.length}`);
  });

  it("deduplicates identical uploads", async () => {
    const room = await createRoom(server);
    const a = (await (await upload(room.id, PNG)).json()) as { assetId: string };
    const b = (await (await upload(room.id, PNG)).json()) as { assetId: string };
    expect(a.assetId).toBe(b.assetId);
  });

  it("rejects non-images, empty bodies and unknown rooms", async () => {
    const room = await createRoom(server);
    expect((await upload(room.id, "<svg onload=alert(1)>")).status).toBe(415);
    expect((await upload(room.id, new Uint8Array())).status).toBe(400);
    expect((await upload("doesnotexist1", PNG)).status).toBe(404);
  });

  it("rejects images over the size limit", async () => {
    const room = await createRoom(server);
    const big = new Uint8Array(20 * 1024 * 1024 + 1);
    big.set(PNG.subarray(0, 8));
    expect((await upload(room.id, big)).status).toBe(413);
  });

  it("does not serve assets from another room or with a bad id", async () => {
    const roomA = await createRoom(server);
    const roomB = await createRoom(server);
    const { assetId } = (await (await upload(roomA.id, PNG)).json()) as { assetId: string };
    expect((await fetch(`${server.baseUrl}/api/rooms/${roomB.id}/assets/${assetId}`)).status).toBe(
      404,
    );
    expect(
      (await fetch(`${server.baseUrl}/api/rooms/${roomA.id}/assets/..%2F..%2Fscryboard.db`)).status,
    ).toBe(404);
  });
});

describe("hidden assets", () => {
  let server: TestServer;
  let cleanup: () => void;

  beforeAll(async () => {
    const db = tempDatabasePath();
    cleanup = db.cleanup;
    server = await startTestServer(db.path);
  });
  afterAll(async () => {
    await server.stop();
    cleanup();
  });

  const url = (roomId: string, assetId: string) =>
    `${server.baseUrl}/api/rooms/${roomId}/assets/${assetId}`;

  it("lists the room's images: everything for the GM, only public ones for players", async () => {
    const room = await createRoom(server);
    const base = `${server.baseUrl}/api/rooms/${room.id}/assets`;
    const gmUpload = await fetch(base, {
      method: "POST",
      headers: { authorization: `Bearer ${room.gmToken}` },
      body: PNG,
    });
    const { assetId: secret } = (await gmUpload.json()) as { assetId: string };
    const list = async (token?: string) =>
      (
        (await (
          await fetch(base, { headers: token ? { authorization: `Bearer ${token}` } : {} })
        ).json()) as {
          assets: { assetId: string; public: boolean }[];
        }
      ).assets;

    expect(await list(room.gmToken)).toEqual([
      expect.objectContaining({ assetId: secret, public: false }),
    ]);
    expect(await list()).toEqual([]);

    // Un'immagine caricata da un giocatore è subito pubblica.
    const other = new Uint8Array([...PNG, 1]);
    const playerUpload = await fetch(base, { method: "POST", body: other });
    const { assetId: shared } = (await playerUpload.json()) as { assetId: string };
    expect((await list()).map((a) => a.assetId)).toEqual([shared]);
    expect((await list(room.gmToken)).map((a) => a.assetId).sort()).toEqual(
      [secret, shared].sort(),
    );
    expect((await fetch(`${server.baseUrl}/api/rooms/doesnotexist1/assets`)).status).toBe(404);
  });

  it("keeps GM uploads private until an item using them is public", async () => {
    const room = await createRoom(server);
    const gmHeaders = { authorization: `Bearer ${room.gmToken}` };
    const res = await fetch(`${server.baseUrl}/api/rooms/${room.id}/assets`, {
      method: "POST",
      headers: gmHeaders,
      body: PNG,
    });
    const { assetId } = (await res.json()) as { assetId: string };

    expect((await fetch(url(room.id, assetId))).status).toBe(404);
    expect(
      (await fetch(url(room.id, assetId), { headers: { authorization: "Bearer wrong" } })).status,
    ).toBe(404);
    expect((await fetch(url(room.id, assetId), { headers: gmHeaders })).status).toBe(200);

    // Il GM rivela un oggetto che usa l'immagine: da quel momento la vedono tutti.
    const gm = await connect(server, roomDocumentName(room.id, "public"), room.gmToken);
    if (gm.status !== "synced") throw new Error("not synced");
    gm.doc.getMap("items").set("i", {
      id: "i",
      kind: "image",
      layer: "map",
      x: 0,
      y: 0,
      rotation: 0,
      z: 0,
      locked: false,
      createdBy: "gm",
      assetId,
      width: 1,
      height: 1,
    });
    await new Promise((r) => setTimeout(r, 100));
    expect((await fetch(url(room.id, assetId))).status).toBe(200);
    gm.provider.destroy();
  });

  it("lets players download the image the GM is showing them", async () => {
    const room = await createRoom(server);
    const res = await fetch(`${server.baseUrl}/api/rooms/${room.id}/assets`, {
      method: "POST",
      headers: { authorization: `Bearer ${room.gmToken}` },
      body: PNG,
    });
    const { assetId } = (await res.json()) as { assetId: string };
    expect((await fetch(url(room.id, assetId))).status).toBe(404);

    const gm = await connect(server, roomDocumentName(room.id, "public"), room.gmToken);
    if (gm.status !== "synced") throw new Error("not synced");
    gm.doc.getMap("settings").set("handout", { id: "h1", assetId });
    await new Promise((r) => setTimeout(r, 100));
    expect((await fetch(url(room.id, assetId))).status).toBe(200);
    gm.provider.destroy();
  });

  it("makes player uploads public", async () => {
    const room = await createRoom(server);
    const res = await fetch(`${server.baseUrl}/api/rooms/${room.id}/assets`, {
      method: "POST",
      body: PNG,
    });
    const { assetId } = (await res.json()) as { assetId: string };
    expect((await fetch(url(room.id, assetId))).status).toBe(200);
  });
});
