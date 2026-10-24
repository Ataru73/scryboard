import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const serverUrl = process.env.SCRYBOARD_SERVER_URL ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  // Konva da solo pesa ~400 kB: il bundle unico (≈240 kB gzip) va bene finché l'app è piccola.
  build: { chunkSizeWarningLimit: 1000 },
  server: {
    port: 5173,
    proxy: {
      "/api": serverUrl,
      "/collab": { target: serverUrl.replace(/^http/, "ws"), ws: true },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
