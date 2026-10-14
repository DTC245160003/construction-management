import { build, preview } from "vite";
import react from "@vitejs/plugin-react";
import process from "node:process";
import { networkInterfaces } from "node:os";
import { makeTasks } from "./gantt-data.mjs";

// Use the real Gantt component compiled for production. React development stack
// capture and Playwright trace capture must not be counted as product scroll cost.
await build({
    configFile: false,
    plugins: [react()],
    build: { outDir: "t31-dist", rolldownOptions: { input: "tests/fixtures/gantt.html" } }
});
await preview({
    configFile: false, build: { outDir: "t31-dist" },
    plugins: [{
        name: "t31-fixture-data",
        configurePreviewServer(server) {
            server.middlewares.use("/__t31/data", (_request, response) => {
                response.setHeader("Content-Type", "application/json; charset=utf-8");
                response.end(JSON.stringify({ tasks: makeTasks(), start: 0, end: 100, width: 5600 }));
            });
        }
    }],
    preview: { host: process.argv.includes("--lan") ? "0.0.0.0" : "127.0.0.1", port: 5178, strictPort: true }
});
console.log("T-31: http://127.0.0.1:5178/tests/fixtures/gantt.html");
if (process.argv.includes("--lan")) {
    for (const entries of Object.values(networkInterfaces())) {
        for (const entry of entries || []) if (entry.family === "IPv4" && !entry.internal) console.log(`Phone: http://${entry.address}:5178/tests/fixtures/gantt.html`);
    }
}
