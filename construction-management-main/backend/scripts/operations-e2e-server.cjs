const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const { runMigrations } = require("../src/run-migration");
const { hashPassword } = require("../src/config/password");
const { operationsApp } = require("../tests/helpers/operationsApp");
const { bootstrapAdmin } = require("./admin-bootstrap.cjs");
require("dotenv").config({ path: path.join(__dirname, "../.env"), quiet: true });

const schema = `operations_e2e_${randomUUID().replaceAll("-", "")}`;
const connection = process.env.SPRINT2_TEST_DATABASE_URL ? { connectionString: process.env.SPRINT2_TEST_DATABASE_URL } : {
    host: process.env.DB_HOST, port: process.env.DB_PORT, database: process.env.DB_NAME,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD
};
const adminPool = new Pool(connection);
const pool = new Pool({ ...connection, options: `-c search_path=${schema}` });
let server, store, stopping = false;
async function stop() {
    if (stopping) return;
    stopping = true;
    if (server) await new Promise((resolve) => server.close(resolve));
    if (store) await store.close();
    await pool.end();
    await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await adminPool.end();
}
async function main() {
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    const client = await pool.connect();
    try { await runMigrations({ client, command: "up" }); } finally { client.release(); }
    const password = "Operations-only-E2E-123!";
    const hash = await hashPassword(password);
    const users = {};
    for (const role of ["admin", "project_manager", "engineer", "worker", "viewer", "accountant"]) {
        const roleId = (await pool.query("INSERT INTO roles(name) VALUES($1) RETURNING id", [role])).rows[0].id;
        users[role] = (await pool.query("INSERT INTO users(fullname,email,password_hash,role_id) VALUES($1,$2,$3,$4) RETURNING id", [role === "worker" ? "Đội trưởng kiểm thử" : `Kiểm thử ${role}`, `${role}@e2e.test`, hash, roleId])).rows[0].id;
    }
    const database=(await pool.query("SELECT current_database() AS name")).rows[0].name;
    await bootstrapAdmin(pool,{ email:"admin@e2e.test",action:"grant",confirmed:true,database,operator:"e2e-fixture" });
    const project = (await pool.query("INSERT INTO projects(name,location,start_date) VALUES('E2E công trường','Hà Nội','2026-10-03') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO project_members(project_id,user_id,role_id) SELECT $1,id,role_id FROM users", [project]);
    const item = (await pool.query("INSERT INTO work_items(project_id,title) VALUES($1,'Thi công móng') RETURNING id", [project])).rows[0].id;
    const tasks = (await pool.query("INSERT INTO tasks(work_item_id,name,duration_days) VALUES($1,'Đổ bê tông',3),($1,'Lắp thép',2),($1,'Dựng cốp pha',3),($1,'Kiểm tra móng',1) RETURNING id", [item])).rows.map((row) => row.id);
    const { app: application, store: sessionStore } = operationsApp(pool);
    const app=require("express")(),unavailable=new Set();
    if (process.env.SPRINT45_E2E==="1") app.use((req,res,next) => {
        const path=req.url.match(/^\/projects\/(\d+)\/(?:journals\/sync|photos)(?:\?|$)/);
        if (path && req.method==="POST" && unavailable.has(Number(path[1]))) return res.status(503).json({ message:"Test transport unavailable" });
        next();
    });
    app.use(application);
    store = sessionStore;
    app.get("/__fixture", (req, res) => res.json({ projectId: project, workItemId: item, tasks,schema,database }));
    if (process.env.SPRINT45_E2E==="1") {
        app.post("/__sprint45/network",async (req,res) => {
            const pid=Number(req.body.projectId);
            if (!req.session.userId || !(await pool.query("SELECT 1 FROM project_members WHERE user_id=$1 AND project_id=$2",[req.session.userId,pid])).rowCount) return res.sendStatus(403);
            if (req.body.unavailable) unavailable.add(pid); else unavailable.delete(pid);
            res.sendStatus(204);
        });
        app.post("/__sprint45/project",async (req,res) => {
            if (!req.session.userId) return res.sendStatus(401);
            const id=(await pool.query("INSERT INTO projects(name,location,start_date) VALUES('Sprint45 browser test','Test','2026-10-01') RETURNING id")).rows[0].id;
            await pool.query("INSERT INTO project_members(project_id,user_id,role_id) SELECT $1,id,role_id FROM users",[id]);
            const leaf=(await pool.query("INSERT INTO work_items(project_id,title) VALUES($1,'Móng E2E') RETURNING id",[id])).rows[0].id;
            res.json({ projectId:id,workItemId:leaf });
        });
        app.get("/__sprint45/evidence",async (req,res) => {
            if (!req.session.userId) return res.sendStatus(401);
            const pid=Number(req.query.projectId);
            const member=await pool.query("SELECT 1 FROM project_members WHERE user_id=$1 AND project_id=$2",[req.session.userId,pid]);
            if (!member.rowCount) return res.sendStatus(403);
            const rows=(await pool.query("SELECT id,client_uuid,content,revision FROM site_journals WHERE project_id=$1 ORDER BY id",[pid])).rows;
            const photos=(await pool.query("SELECT count(*)::int n,coalesce(sum(octet_length(original)),0)::bigint original_bytes,coalesce(max(octet_length(thumbnail)),0)::int thumbnail_max_bytes FROM site_photos WHERE project_id=$1",[pid])).rows[0];
            const daily=(await pool.query("SELECT count(*)::int n FROM journal_daily_info WHERE project_id=$1",[pid])).rows[0].n;
            res.json({ schema,journals:rows,photos:photos.n,originalPhotoBytes:Number(photos.original_bytes),maxThumbnailBytes:photos.thumbnail_max_bytes,daily });
        });
    }
    app.post("/__shutdown", (req, res) => { res.sendStatus(204); setImmediate(() => stop().catch(() => { process.exitCode = 1; })); });
    server = app.listen(3031, "127.0.0.1", () => console.log("Operations E2E API ready on 3031 (isolated schema)"));
}
process.once("SIGTERM", () => stop().catch(() => { process.exitCode = 1; }));
process.once("SIGINT", () => stop().catch(() => { process.exitCode = 1; }));
main().catch(async (error) => { console.error("E2E setup failed", error.code || error.message); await stop(); process.exitCode = 1; });
