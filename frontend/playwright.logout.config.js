import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import base from "./playwright.config.js";

const origin = "http://127.0.0.1:5187";

export default defineConfig({
  ...base,
  testMatch: "logout.spec.js",
  testIgnore: [],
  // A cold Vite dependency scan shares the first test's startup budget.
  timeout: 120000,
  outputDir: "./test-results/logout",
  reporter: [
    ["list"],
    ["json", {
      outputFile: fileURLToPath(new URL("../docs/integration/logout/resume-playwright-ui.json", import.meta.url)),
    }],
  ],
  use: { ...base.use, baseURL: origin },
  webServer: {
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5187 --strictPort",
    url: origin,
    env: { VITE_ENABLE_JOURNAL_SW: "" },
    reuseExistingServer: false,
  },
});
