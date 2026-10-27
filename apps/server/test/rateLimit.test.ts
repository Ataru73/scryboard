import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { clientIp, rateLimit } from "../src/http/rateLimit";

describe("rateLimit and clientIp", () => {
  it("extracts the rightmost untrusted hop from X-Forwarded-For when trustProxy is true", () => {
    const app = new Hono();
    let detectedIp = "";
    app.get("/test", (c) => {
      detectedIp = clientIp(c, true);
      return c.text("ok");
    });

    // Client spoofs 1.1.1.1, proxy appends 2.2.2.2
    app.request("/test", {
      headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" },
    });
    expect(detectedIp).toBe("2.2.2.2");
  });

  it("does not trust Fly-Client-IP unless FLY_APP_NAME is set in the environment", () => {
    const app = new Hono();
    let detectedIp = "";
    app.get("/test", (c) => {
      detectedIp = clientIp(c, true);
      return c.text("ok");
    });

    const origFly = process.env.FLY_APP_NAME;
    try {
      delete process.env.FLY_APP_NAME;
      app.request("/test", {
        headers: {
          "fly-client-ip": "1.2.3.4",
          "x-forwarded-for": "5.6.7.8",
        },
      });
      // Should ignore fly-client-ip and use x-forwarded-for rightmost
      expect(detectedIp).toBe("5.6.7.8");

      process.env.FLY_APP_NAME = "scryboard-app";
      app.request("/test", {
        headers: {
          "fly-client-ip": "1.2.3.4",
          "x-forwarded-for": "5.6.7.8",
        },
      });
      // Now running on Fly, so fly-client-ip is trusted
      expect(detectedIp).toBe("1.2.3.4");
    } finally {
      if (origFly) process.env.FLY_APP_NAME = origFly;
      else delete process.env.FLY_APP_NAME;
    }
  });

  it("enforces rate limits and responds with 429 after exceeding max", async () => {
    const app = new Hono();
    app.use(
      "*",
      rateLimit({
        max: 3,
        windowMs: 60_000,
        trustProxy: true,
        message: "Too many requests",
      }),
    );
    app.get("/ping", (c) => c.text("pong"));

    const req = () =>
      app.request("/ping", {
        headers: { "x-forwarded-for": "9.9.9.9" },
      });

    const res1 = await req();
    expect(res1.status).toBe(200);
    const res2 = await req();
    expect(res2.status).toBe(200);
    const res3 = await req();
    expect(res3.status).toBe(200);

    const res4 = await req();
    expect(res4.status).toBe(429);
    const body = (await res4.json()) as { error: string };
    expect(body.error).toBe("Too many requests");
    expect(res4.headers.get("retry-after")).toBeTruthy();
  });
});
