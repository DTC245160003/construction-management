import { defineConfig } from "@playwright/test";
import config from "./playwright.config.js";

export default defineConfig({
    ...config,
    testMatch: "**/gantt-t31.spec.js",
    testIgnore: [],
    outputDir: "./t31-results",
    reporter: [["line"], ["json", { outputFile: "../docs/sprint3/t31/browser-results.json" }]],
    use: { ...config.use, baseURL: "http://127.0.0.1:5178", trace: "off" },
    webServer: {
        command: "node tests/fixtures/gantt-server.mjs",
        url: "http://127.0.0.1:5178/tests/fixtures/gantt.html",
        reuseExistingServer: false
    }
});
