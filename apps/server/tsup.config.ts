import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/prune.ts"],
  format: "esm",
  platform: "node",
  target: "node24",
  // Il pacchetto shared è sorgente TypeScript: va incluso nel bundle.
  noExternal: ["@scryboard/shared"],
  sourcemap: true,
  clean: true,
});
