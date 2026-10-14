import { defineConfig } from "@playwright/test";
import config from "./playwright.t31.config.js";

export default defineConfig({
    ...config,
    testMatch: "**/gantt-t3[23].spec.js",
    outputDir: "./test-results/gantt-review",
    reporter: [["line"], ["json", { outputFile: "../docs/sprint3/t32-t35/frontend-results.json" }]]
});
