import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";
export default defineConfig({ ...base,testIgnore:["**/*.real.spec.js","**/projects.visual.spec.js","**/gantt-t31.spec.js","**/unified-shell.spec.js"],
  outputDir:"test-results/ui-regression",reporter:[["list"],["json",{ outputFile:"../docs/sprint4-5/ui-regression-results.json" }]],
});
