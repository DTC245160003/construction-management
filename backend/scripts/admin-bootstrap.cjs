const path = require("node:path");
const os = require("node:os");
const { Pool } = require("pg");
const {createDatabaseConfig}=require('../src/config/databaseConfig');
const {targetDatabase}=require('../src/config/databaseTarget');

function bootstrapConfig(env,args) {
    const value=name => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length+3);
    const database=value("database"),email=String(value("email") || "").trim().toLowerCase(),action=value("action") || "grant";
    if (!database || !/^[a-z][a-z0-9_]{0,62}$/.test(database)) throw new Error("Provide the exact target database: --database=construction_sprint45_demo");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>255) throw new Error("Provide an existing account: --email=you@example.com");
    if (!["grant","revoke"].includes(action)) throw new Error("Action must be grant or revoke");
    const confirmation=`${action.toUpperCase()}_SUPER_ADMIN:${database}:${email}`;
    return { email,action,confirmation,confirmed:value("confirm")===confirmation,dryRun:args.includes("--dry-run"),
        connection:env.DATABASE_URL?targetDatabase(createDatabaseConfig(env),database):{ host:env.DB_HOST,port:env.DB_PORT,user:env.DB_USER,password:env.DB_PASSWORD,database } };
}

async function bootstrapAdmin(pool,{ email,action,confirmed,database,operator="server_cli" }) {
    if (!["grant","revoke"].includes(action)) throw new Error("Action must be grant or revoke");
    if (!confirmed) throw new Error("Explicit database/action confirmation is required before changing privileges");
    const client=await pool.connect();
    try {
        await client.query("BEGIN");
        const actual=(await client.query("SELECT current_database() AS name")).rows[0].name;
        if (actual!==database) throw new Error("Connected database does not match the confirmed target");
        const before=(await client.query("SELECT id,system_role,is_active FROM users WHERE lower(email)=$1 FOR UPDATE",[email])).rows[0];
        if (!before) throw new Error("Account must already exist; register it first. No account or password was created");
        if (action==="grant" && !before.is_active) throw new Error("Activate the account through the authorized administration workflow before granting Super Admin");
        const role=action==="grant" ? "super_admin" : "user";
        if (before.system_role===role) { await client.query("COMMIT"); return { userId:before.id,system_role:role,changed:false }; }
        const after=(await client.query("UPDATE users SET system_role=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING id,system_role,is_active",[before.id,role])).rows[0];
        await client.query("INSERT INTO audit_logs(module,action,object_id,before_value,after_value) VALUES('system_admin',$1,$2,$3,$4)",
            [action==="grant" ? "grant_super_admin" : "revoke_super_admin",String(before.id),before,{ ...after,actor_type:"server_cli",operator,database:actual }]);
        await client.query("COMMIT"); return { userId:before.id,system_role:role,changed:true };
    } catch(e) {
        await client.query("ROLLBACK");
        if (e.code==="23514") throw new Error("Cannot remove the last active Super Admin",{ cause:e });
        throw e;
    } finally { client.release(); }
}

async function main() {
    require("dotenv").config({ path:path.join(__dirname,"../.env"),quiet:true });
    const config=bootstrapConfig(process.env,process.argv.slice(2));
    const pool=new Pool(config.connection);
    try {
        const actual=(await pool.query("SELECT current_database() AS name,current_user AS database_user")).rows[0];
        if (actual.name!==config.connection.database) throw new Error("Target database mismatch");
        const account=(await pool.query("SELECT id,system_role,is_active FROM users WHERE lower(email)=$1",[config.email])).rows[0];
        if (!account) throw new Error("Account must already exist; register it first. No account or password was created");
        const url=config.connection.connectionString?new URL(config.connection.connectionString):null;
        console.log(`Target: ${actual.name} at ${url?.hostname || config.connection.host || "localhost"}:${url?.port || config.connection.port || "5432"}; database operator: ${actual.database_user}`);
        console.log(`Action: ${config.action} Super Admin for ${config.email}; current system role: ${account.system_role}`);
        if (config.dryRun) { console.log(`Read-only preview. Required confirmation: ${config.confirmation}`); return; }
        if (!config.confirmed && process.stdin.isTTY && process.stdout.isTTY) {
            const readline=require("node:readline/promises").createInterface({ input:process.stdin,output:process.stdout });
            try { config.confirmed=(await readline.question(`Type ${config.confirmation} to continue: `))===config.confirmation; }
            finally { readline.close(); }
        }
        const result=await bootstrapAdmin(pool,{ ...config,database:actual.name,operator:`${os.userInfo().username} / ${actual.database_user}` });
        console.log(result.changed ? "Privilege updated and audited. Refresh or sign in again." : "Account already has the requested system role; no duplicate account or audit entry.");
    } finally { await pool.end(); }
}
if (require.main===module) main().catch(e => { console.error("Admin bootstrap failed:",e.code || e.message); process.exitCode=1; });
module.exports={ bootstrapConfig,bootstrapAdmin };
