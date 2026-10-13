import { defineConfig } from "@playwright/test";
import process from "node:process";

export default defineConfig({
    testDir: "./tests",
    testMatch: "**/*.spec.js",
    testIgnore: ["**/gantt-t31.spec.js","**/sprint45.real.spec.js","**/system-admin.real.spec.js"],
    fullyParallel: false,
    workers: 1,
    timeout: 60000,
    expect: { timeout: 15000 },
    use: {
        baseURL: "http://127.0.0.1:5175",
        channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform==="win32" ? "chrome" : undefined),
        headless: true,
        screenshot: "only-on-failure",
        trace: "retain-on-failure"
    },
    webServer: {
        command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5175 --strictPort",
        url: "http://127.0.0.1:5175",
        env: {
            VITE_ENABLE_JOURNAL_SW: process.env.OPERATIONS_REAL_E2E ? "1" : ""
        },
        reuseExistingServer: !process.env.CI
    }
});
