import { defineConfig } from "@playwright/test";
import process from "node:process";
export default defineConfig({
  testDir:"./tests",testMatch:"sprint45.real.spec.js",workers:1,fullyParallel:false,timeout:170000,
  globalTeardown:"./tests/sprint45.teardown.js",
  expect:{ timeout:20000 },outputDir:"test-results/sprint45",
  reporter:[["list"],["json",{ outputFile:"../docs/sprint4-5/playwright-results.json" }],["html",{ outputFolder:"playwright-report/sprint45",open:"never" }]],
  use:{ baseURL:"http://127.0.0.1:4175",headless:true,actionTimeout:10000,channel:process.env.PLAYWRIGHT_CHANNEL || (process.platform==="win32" ? "chrome" : undefined),screenshot:"only-on-failure",trace:"retain-on-failure" },
  webServer:[
    { command:"node ../backend/scripts/operations-e2e-server.cjs",url:"http://127.0.0.1:3031/__fixture",reuseExistingServer:false,env:{ SPRINT45_E2E:"1" },timeout:30000 },
    { command:"npm run preview -- --host 127.0.0.1 --port 4175 --strictPort",url:"http://127.0.0.1:4175",reuseExistingServer:false,env:{ API_PROXY_TARGET:"http://127.0.0.1:3031" } },
  ],
});
