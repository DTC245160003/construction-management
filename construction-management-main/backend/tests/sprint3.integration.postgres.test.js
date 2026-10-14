const { Pool } = require("pg");
const request = require("supertest");
const { randomUUID, createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { runMigrations } = require("../src/run-migration");
const { hashPassword } = require("../src/config/password");
const { operationsApp } = require("./helpers/operationsApp");
const describeDatabase = process.env.SPRINT2_TEST_DATABASE_URL ? describe : describe.skip;

describeDatabase("Sprint 3 integrated actuals, calendar, baseline and milestones", () => {
    const schema = `sprint3_merge_${randomUUID().replaceAll("-", "")}`;
    let admin, pool, store, app, project, item, firstTask, lastTask;
    const agents = {}, users = {};
    async function migrate(command = "up", database = pool) {
        const client = await database.connect();
        try { return await runMigrations({ client, command }); } finally { client.release(); }
    }
    const url = suffix => `/projects/${project}${suffix}`;
    beforeAll(async () => {
        admin = new Pool({ connectionString: process.env.SPRINT2_TEST_DATABASE_URL });
        await admin.query(`CREATE SCHEMA "${schema}"`);
        pool = new Pool({ connectionString: process.env.SPRINT2_TEST_DATABASE_URL, options: `-c search_path=${schema}` });
        await migrate();
        ({ app, store } = operationsApp(pool));
        const password = "Sprint3-integration-only-123!";
        const hash = await hashPassword(password);
        for (const role of ["admin", "engineer", "viewer"]) {
            const roleId = (await pool.query("INSERT INTO roles(name) VALUES($1) RETURNING id", [role])).rows[0].id;
            users[role] = (await pool.query("INSERT INTO users(fullname,email,password_hash,role_id) VALUES($1,$2,$3,$4) RETURNING id", [role, `${role}@sprint3.test`, hash, roleId])).rows[0].id;
            agents[role] = request.agent(app);
            await agents[role].post("/auth/login").send({ email: `${role}@sprint3.test`, password }).expect(200);
        }
        project = (await pool.query("INSERT INTO projects(name,start_date) VALUES('Sprint 3 integration','2026-10-01') RETURNING id")).rows[0].id;
        for (const role of Object.keys(users)) await pool.query("INSERT INTO project_members(project_id,user_id,role_id) SELECT $1,$2,id FROM roles WHERE name=$3", [project, users[role], role]);
        item = (await pool.query("INSERT INTO work_items(project_id,title) VALUES($1,'Foundation') RETURNING id", [project])).rows[0].id;
        firstTask = (await agents.engineer.post(url("/tasks")).send({ work_item_id: item, name: "Excavation", duration_days: 3 }).expect(201)).body.task.id;
        lastTask = (await agents.engineer.post(url("/tasks")).send({ work_item_id: item, name: "Concrete", duration_days: 2 }).expect(201)).body.task.id;
        await agents.engineer.post(url(`/tasks/${lastTask}/dependencies`)).send({ predecessor_task_id: firstTask, dependency_type: "FS", lag_days: 0 }).expect(201);
    });
    afterAll(async () => {
        if (store) await store.close();
        if (pool) await pool.end();
        if (admin) { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end(); }
    });

    test("T35 updates canonical actuals; T36 recalculates while T41 snapshot and T44/T45 alerts survive", async () => {
        const initial = (await agents.admin.get(url("/schedule")).expect(200)).body;
        expect(initial.summary).toEqual({ plannedFinish: 5, currentFinish: 5, delayDays: 0 });
        await agents.admin.post(url("/baselines")).send({}).expect(201);
        await agents.viewer.post(url("/work-item-milestones")).send({ work_item_id: item, name: "Foundation handover", target_date: "2026-10-06" }).expect(201);
        const saved = (await agents.engineer.patch(url(`/tasks/${firstTask}/progress`)).send({ actualStart: "2026-10-01", actualEnd: "2026-10-07", percentComplete: 100 }).expect(200)).body.task;
        expect(saved).toMatchObject({ actual_start: "2026-10-01", actual_finish: "2026-10-07", progress_percent: 100 });
        const changed = (await agents.admin.get(url("/schedule")).expect(200)).body;
        expect(changed.summary).toEqual({ plannedFinish: 5, currentFinish: 8, delayDays: 3 });
        expect(changed.schedule.find(task => task.id === firstTask)).toMatchObject({ es: 0, ef: 6, baseline_es: 0, baseline_ef: 3 });
        expect(changed.schedule.find(task => task.id === lastTask)).toMatchObject({ es: 6, ef: 8, baseline_es: 3, baseline_ef: 5 });
        const alerts = (await agents.admin.get(url("/milestone-alerts")).expect(200)).body.alerts;
        expect(alerts[0]).toMatchObject({ status: "open", overdue_working_days: 3, critical_path: ["Excavation", "Concrete"] });
        await agents.admin.post(url("/baselines")).send({}).expect(201);
        const history = (await agents.viewer.get(url("/baselines/history")).expect(200)).body.history;
        expect(history.find(row => row.task_id === lastTask).early_finish).toBe("5");
        await agents.engineer.patch(url(`/tasks/${firstTask}/progress`)).send({ actualEnd: "2026-10-03" }).expect(200);
        const restored = (await agents.admin.get(url("/schedule")).expect(200)).body;
        expect(restored.summary.delayDays).toBe(0);
        expect((await agents.admin.get(url("/milestone-alerts"))).body.alerts[0].status).toBe("resolved");
    });

    test("authorization, invalid dates, task isolation and canonical schema are enforced", async () => {
        await request(app).get(url("/schedule")).expect(401);
        await agents.viewer.patch(url(`/tasks/${firstTask}/progress`)).send({ percentComplete: 10 }).expect(403);
        await agents.engineer.post(url("/baselines")).send({}).expect(403);
        await agents.engineer.patch(url(`/tasks/${firstTask}/progress`)).send({ actualStart: "2026-02-30" }).expect(400);
        await agents.engineer.patch(url(`/tasks/${firstTask}/progress`)).send({ percentComplete: 101 }).expect(400);
        await agents.engineer.patch(url("/tasks/2147483647/progress")).send({ percentComplete: 50 }).expect(404);
        const columns = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='tasks'", [schema])).rows.map(row => row.column_name);
        expect(columns).toEqual(expect.arrayContaining(["actual_start", "actual_finish", "progress_percent"]));
        expect(columns).not.toEqual(expect.arrayContaining(["actual_start_date", "actual_end_date", "percent_complete"]));
        const history = (await pool.query("SELECT name FROM schema_migrations ORDER BY name")).rows.map(row => row.name);
        expect(history).toEqual(expect.arrayContaining([
            "015_add_task_actuals.sql", "016_create_baselines_and_milestones.sql",
            "017_add_lock_fields_to_daily_logs.sql", "017_sprint4_5.sql", "018_system_administration.sql",
            "019_reconcile_journal_lock_guards.sql"
        ]));
    });

    test("T40 holiday changes dates and milestone warning without discarding the baseline", async () => {
        await pool.query("INSERT INTO project_holidays(project_id,day,name) VALUES($1,'2026-10-05','Holiday')", [project]);
        await agents.admin.get(url("/schedule")).expect(200);
        expect((await agents.admin.get(url("/milestone-alerts"))).body.alerts.some(alert => alert.status === "open" && alert.overdue_working_days === 1)).toBe(true);
        expect((await pool.query("SELECT count(*)::int AS count FROM baselines WHERE project_id=$1", [project])).rows[0].count).toBe(2);
    });

    test("existing 832f3e6 migration history upgrades with baseline records intact", async () => {
        const legacySchema = `${schema}_legacy`;
        await admin.query(`CREATE SCHEMA "${legacySchema}"`);
        const legacy = new Pool({ connectionString: process.env.SPRINT2_TEST_DATABASE_URL, options: `-c search_path=${legacySchema}` });
        try {
            const directory = path.join(__dirname, "../src/migrations");
            const names = fs.readdirSync(directory).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name) && !name.startsWith("015_")).sort();
            await legacy.query("CREATE TABLE schema_migrations(name TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)");
            for (const name of names) {
                const sql = fs.readFileSync(path.join(directory, name), "utf8").replace(/\r\n/g, "\n");
                await legacy.query(sql);
                await legacy.query("INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)", [name.replace("016_create_baselines", "015_create_baselines"), createHash("sha256").update(sql).digest("hex")]);
            }
            const user = (await legacy.query("INSERT INTO users(email,password_hash) VALUES('legacy@test.local','test-only') RETURNING id")).rows[0].id;
            const p = (await legacy.query("INSERT INTO projects(name) VALUES('Preserve') RETURNING id")).rows[0].id;
            const w = (await legacy.query("INSERT INTO work_items(project_id,title) VALUES($1,'Preserve') RETURNING id", [p])).rows[0].id;
            const t = (await legacy.query("INSERT INTO tasks(work_item_id,name,duration_days) VALUES($1,'Preserve',2) RETURNING id", [w])).rows[0].id;
            await legacy.query("INSERT INTO baselines(project_id,task_id,early_start,early_finish,late_start,late_finish,user_id) VALUES($1,$2,0,2,0,2,$3)", [p,t,user]);
            const before = (await legacy.query("SELECT * FROM baselines")).rows;
            expect(await migrate("up", legacy)).toEqual(["Applied: 015_add_task_actuals.sql"]);
            expect((await legacy.query("SELECT * FROM baselines")).rows).toEqual(before);
            expect(await migrate("up", legacy)).toEqual(["No pending migrations."]);
        } finally { await legacy.end(); await admin.query(`DROP SCHEMA "${legacySchema}" CASCADE`); }
    });
});
