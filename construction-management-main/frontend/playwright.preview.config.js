import { defineConfig } from "@playwright/test";
import config from "./playwright.config.js";

export default defineConfig({
    ...config,
    testMatch: "**/schedule-ux.spec.js",
    outputDir: "./preview-results",
    use: { ...config.use, baseURL: "http://127.0.0.1:5177" },
    webServer: {
        command: "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5177 --strictPort",
        url: "http://127.0.0.1:5177",
        reuseExistingServer: false
    }
});
