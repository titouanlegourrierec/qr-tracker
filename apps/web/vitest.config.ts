import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: { url: "http://localhost:5173/" },
    },
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "istanbul",
      include: ["src/**/*.{ts,tsx}"],
      // ChartCanvas needs a real <canvas> (Chart.js); it is exercised by the
      // Playwright E2E suite instead of jsdom. main.tsx is the bootstrap.
      exclude: ["src/main.tsx", "src/env.d.ts", "src/components/ChartCanvas.tsx"],
      thresholds: { lines: 80 },
    },
  },
});
