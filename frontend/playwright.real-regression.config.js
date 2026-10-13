import { defineConfig } from "@playwright/test";
import base from "./playwright.sprint45.config.js";
import process from "node:process";
process.env.OPERATIONS_REAL_E2E="1";
process.env.PWA_PRODUCTION_E2E="1";
export default defineConfig({ ...base,testMatch:["operations.real.spec.js","site.real.spec.js","sprint3.real.spec.js","projects.visual.spec.js"],
  outputDir:"test-results/real-regression",reporter:[["list"],["json",{ outputFile:"../docs/sprint4-5/real-regression-results.json" }]],
});
