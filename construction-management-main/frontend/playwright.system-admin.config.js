import { defineConfig } from "@playwright/test";
import base from "./playwright.sprint45.config.js";
export default defineConfig({ ...base,testMatch:"system-admin.real.spec.js",timeout:90000,
  outputDir:"test-results/system-admin",reporter:[["list"],["json",{ outputFile:"../docs/super-admin/playwright-results.json" }]],
});
