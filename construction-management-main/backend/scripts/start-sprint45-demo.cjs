const path=require("node:path");
const { Pool }=require("pg");
const { runMigrations }=require("../src/run-migration");
const { seedRoles }=require("../src/seed-roles");
require("dotenv").config({ path:path.join(__dirname,"../.env"),quiet:true });

async function main() {
    const database=process.env.SPRINT45_DEMO_DB || "construction_sprint45_demo";
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(database) || database===process.env.DB_NAME) throw new Error("Use a separate demo database name");
    const connection={ host:process.env.DB_HOST,port:process.env.DB_PORT,user:process.env.DB_USER,password:process.env.DB_PASSWORD };
    const existing=new Pool({ ...connection,database:process.env.DB_NAME });
    try {
        if (!(await existing.query("SELECT 1 FROM pg_database WHERE datname=$1",[database])).rowCount) {
            await existing.query(`CREATE DATABASE "${database}"`);
        }
    } finally { await existing.end(); }
    const demo=new Pool({ ...connection,database });
    try {
        const client=await demo.connect();
        try { for (const message of await runMigrations({ client })) console.log(message); await seedRoles(client); }
        finally { client.release(); }
    } finally { await demo.end(); }
    process.env.DB_NAME=database;
    process.env.PORT ||= "3045";
    console.log(`Sprint 4-5 demo database: ${database}. Existing database is unchanged.`);
    require("../src/server");
}
main().catch((error) => { console.error("Demo startup failed:",error.code || error.message); process.exitCode=1; });
