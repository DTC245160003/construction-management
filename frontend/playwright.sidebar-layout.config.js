import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import process from "node:process";

const origin = "http://127.0.0.1:5188";
export default defineConfig({
  testDir: "./tests",
  testMatch: "sidebar-layout.spec.js",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 10000 },
  outputDir: "./test-results/sidebar-layout",
  reporter: [["list"], ["json", {
    outputFile: fileURLToPath(new URL("../.tmp/sidebar-complete-playwright.json", import.meta.url)),
  }]],
  use: {
    baseURL: origin,
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "chrome" : undefined),
    headless: true,
    serviceWorkers: "block",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-1366x650", use: { viewport: { width: 1366, height: 650 } } },
    { name: "mobile-411x808", use: { viewport: { width: 411, height: 808 }, isMobile: true, hasTouch: true } },
    { name: "landscape-915x411", use: { viewport: { width: 915, height: 411 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    command: "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5188 --strictPort --outDir ../.tmp/sidebar-complete-build",
    url: origin,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
