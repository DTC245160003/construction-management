const path=require("node:path");
const {createDatabaseConfig}=require('../src/config/databaseConfig');
const {databaseName,targetDatabase}=require('../src/config/databaseTarget');
require("dotenv").config({ path:path.join(__dirname,"../.env"),quiet:true });

async function main() {
    const database=process.env.SPRINT45_DEMO_DB || "construction_sprint45_demo";
    const config=createDatabaseConfig();
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(database) || database===databaseName(config)) throw new Error("Use a separate, reviewed database copy");
    // This historical database contains real user accounts. Startup must never
    // create, migrate or seed it. The unified server checks schema read-only.
    if(config.connectionString)process.env.DATABASE_URL=targetDatabase(config,database).connectionString;
    else process.env.DB_NAME=database;
    process.env.PORT ||= "3045";
    console.log(`Historical Sprint 4-5 startup: ${database}; no automatic migration or seed. Use a verified upgraded copy.`);
    await require("../src/server").main();
}
if(require.main===module)main().catch((error) => { console.error("Demo startup failed:",error.code || error.message); process.exitCode=1; });
module.exports={main};
