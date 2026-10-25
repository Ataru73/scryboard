import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("salva le immagini su disco per default", () => {
    expect(loadConfig({}).assetStorage).toEqual({ type: "local" });
  });

  it("usa il bucket quando ASSET_STORAGE=gcs", () => {
    const config = loadConfig({ ASSET_STORAGE: "gcs", GCS_BUCKET: "scryboard-assets" });
    expect(config.assetStorage).toEqual({ type: "gcs", bucket: "scryboard-assets" });
  });

  it("rifiuta gcs senza bucket e valori sconosciuti", () => {
    expect(() => loadConfig({ ASSET_STORAGE: "gcs" })).toThrow("GCS_BUCKET");
    expect(() => loadConfig({ ASSET_STORAGE: "s3" })).toThrow("ASSET_STORAGE");
  });
});
