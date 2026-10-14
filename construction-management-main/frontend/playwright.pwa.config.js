import { defineConfig } from "@playwright/test";
import process from "node:process";

process.env.OPERATIONS_REAL_E2E="1";
process.env.PWA_PRODUCTION_E2E="1";

export default defineConfig({
    testDir: "./tests",
    testMatch: "site.real.spec.js",
    grep: /journal persists offline/,
    fullyParallel: false,
    workers: 1,
    timeout: 60000,
    use: {
        baseURL: "http://127.0.0.1:4175",
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
        headless: true,
        screenshot: "only-on-failure",
        trace: "retain-on-failure"
    },
    webServer: {
        command: "npm run preview -- --host 127.0.0.1 --port 4175 --strictPort",
        url: "http://127.0.0.1:4175",
        env: {
            API_PROXY_TARGET: process.env.API_PROXY_TARGET || "http://127.0.0.1:3031"
        },
        reuseExistingServer: !process.env.CI
    }
});
