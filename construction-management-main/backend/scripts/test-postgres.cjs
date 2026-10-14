// Every PostgreSQL suite creates and removes only its own UUID-named schema.
const { spawnSync } = require("node:child_process");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "../.env"), quiet: true });
if (!process.env.SPRINT2_TEST_DATABASE_URL) {
    const url = new URL("postgresql://localhost");
    url.hostname = process.env.DB_HOST || "localhost";
    url.port = process.env.DB_PORT || "5432";
    url.username = process.env.DB_USER || "postgres";
    url.password = process.env.DB_PASSWORD || "";
    url.pathname = `/${process.env.DB_NAME || "postgres"}`;
    process.env.SPRINT2_TEST_DATABASE_URL = url.href;
}
const result = spawnSync(process.execPath, [require.resolve("jest/bin/jest"), "--runInBand", ...process.argv.slice(2)], {
    cwd: path.join(__dirname, ".."), env: process.env, stdio: "inherit"
});
if (result.error) throw result.error;
process.exitCode = result.status || 0;
