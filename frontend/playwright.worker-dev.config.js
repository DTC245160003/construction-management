import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";
import process from "node:process";
process.env.OPERATIONS_REAL_E2E="1";
export default defineConfig({ ...base,testMatch:"pwa-regression.spec.js",grep:/enabled journal worker/,
  webServer:{ ...base.webServer,env:{ VITE_ENABLE_JOURNAL_SW:"1" },reuseExistingServer:false },
  outputDir:"test-results/worker-dev",reporter:[["list"],["json",{ outputFile:"../docs/sprint4-5/worker-development-results.json" }]],
});
