import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const serverUrl = process.env.SCRYBOARD_SERVER_URL ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
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
