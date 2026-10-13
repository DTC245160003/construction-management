const { Pool } = require("pg");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runMigrations } = require("../src/run-migration");
const { createSiteManagementModel } = require("../src/models/siteManagementModel");

const describePostgres = process.env.SPRINT2_TEST_DATABASE_URL ? describe : describe.skip;
const source = path.join(__dirname, "../src/migrations");
const names = fs.readdirSync(source).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
const lockMigration = "017_add_lock_fields_to_daily_logs.sql";
const reconciliation = "019_reconcile_journal_lock_guards.sql";

describePostgres("Merged migration histories preserve deployed branch data", () => {
    let admin;
    beforeAll(() => { admin = new Pool({ connectionString: process.env.SPRINT2_TEST_DATABASE_URL }); });
    afterAll(async () => { if (admin) await admin.end(); });

    async function withSchema(callback) {
        const schema = `merged_migrations_${randomUUID().replaceAll("-", "")}`;
        await admin.query(`CREATE SCHEMA "${schema}"`);
        const pool = new Pool({ connectionString: process.env.SPRINT2_TEST_DATABASE_URL, options: `-c search_path=${schema}` });
        const client = await pool.connect();
        try { await callback(client); }
        finally { client.release(); await pool.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); }
    }

    test.each(["main", "sprint45"])("%s upgrades without rewriting recorded checksums or business rows", async branch => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "construction-merged-migrations-"));
        const branchNames = names.filter(name => branch === "main"
            ? name <= lockMigration
            : name !== lockMigration && name <= "018_system_administration.sql");
        for (const name of branchNames) {
            fs.copyFileSync(path.join(source, name), path.join(directory, name));
            const down = name.replace(/\.sql$/, ".down.sql");
            if (fs.existsSync(path.join(source, down))) fs.copyFileSync(path.join(source, down), path.join(directory, down));
        }
        try {
            await withSchema(async client => {
                await runMigrations({ client, directory });
                const actor = (await client.query("INSERT INTO users(email,password_hash) VALUES('preserve@merge.test','test-only') RETURNING id")).rows[0].id;
                const project = (await client.query("INSERT INTO projects(name) VALUES('Preserve deployed project') RETURNING id")).rows[0].id;
                const item = (await client.query("INSERT INTO work_items(project_id,title) VALUES($1,'Preserve item') RETURNING id", [project])).rows[0].id;
                const task = (await client.query("INSERT INTO tasks(work_item_id,name,duration_days,progress_percent) VALUES($1,'Preserve actuals',3,25) RETURNING id", [item])).rows[0].id;
                await client.query("INSERT INTO baselines(project_id,task_id,early_start,early_finish,late_start,late_finish,user_id) VALUES($1,$2,0,3,0,3,$3)", [project, task, actor]);
                await client.query("INSERT INTO journal_daily_info(project_id,day,manpower,equipment,weather) VALUES($1,'2026-10-05',7,'Crane','Sunny')", [project]);
                const journal = (await client.query("INSERT INTO site_journals(project_id,work_item_id,author_id,client_uuid,input_hash,day,time,content) VALUES($1,$2,$3,$4,'preserve-hash','2026-10-05','08:30','Preserve content') RETURNING id", [project, item, actor, randomUUID()])).rows[0].id;
                const photo = (await client.query("INSERT INTO site_photos(project_id,work_item_id,uploaded_by,client_uuid,content_hash,filename,mime_type,original,thumbnail) VALUES($1,$2,$3,$4,'preserve-photo','preserve.jpg','image/jpeg',$5,$6) RETURNING id", [project, item, actor, randomUUID(), Buffer.from("original-photo-bytes"), Buffer.from("thumbnail-bytes")])).rows[0].id;
                await client.query("INSERT INTO journal_photos(journal_id,photo_id) VALUES($1,$2)", [journal, photo]);
                if (branch === "main") {
                    await client.query("UPDATE site_journals SET is_locked=TRUE,locked_at='2026-10-05T10:00:00Z',locked_by=$2 WHERE id=$1", [journal, actor]);
                } else {
                    await client.query("UPDATE users SET system_role='super_admin' WHERE id=$1", [actor]);
                    await client.query("INSERT INTO journal_writes(operation_uuid,project_id,actor_id,input_hash,result) VALUES($1,$2,$3,'preserve-write',$4)", [randomUUID(), project, actor, { journal: { id: journal }, replayed: false }]);
                    await client.query("INSERT INTO journal_versions(journal_id,revision,snapshot,actor_id) VALUES($1,1,$2,$3)", [journal, { content: "Preserve content" }, actor]);
                    await client.query("INSERT INTO journal_photo_uploads(client_uuid,journal_id,uploaded_by,filename,photo_id) VALUES($1,$2,$3,'preserve.jpg',$4)", [randomUUID(), journal, actor, photo]);
                    await client.query("INSERT INTO journal_day_locks(project_id,day,changed_by,locked,updated_at) VALUES($1,'2026-10-05',$2,TRUE,'2026-10-05T10:00:00Z')", [project, actor]);
                }
                const beforeHistory = (await client.query("SELECT * FROM schema_migrations ORDER BY name")).rows;
                const beforeTasks = (await client.query("SELECT * FROM tasks ORDER BY id")).rows;
                const beforeBaselines = (await client.query("SELECT * FROM baselines ORDER BY id")).rows;
                const beforePhotos = (await client.query("SELECT * FROM site_photos ORDER BY id")).rows;
                const beforeLinks = (await client.query("SELECT * FROM journal_photos ORDER BY journal_id,photo_id")).rows;
                const beforeJournal = (await client.query("SELECT id,content,client_uuid,input_hash,revision,updated_at FROM site_journals ORDER BY id")).rows;
                const beforeWrites = branch === "sprint45" ? (await client.query("SELECT * FROM journal_writes ORDER BY operation_uuid")).rows : [];

                expect(await runMigrations({ client })).toEqual(branch === "main"
                    ? ["Applied: 017_sprint4_5.sql", "Applied: 018_system_administration.sql", `Applied: ${reconciliation}`]
                    : [`Applied: ${lockMigration}`, `Applied: ${reconciliation}`]);
                const afterHistory = (await client.query("SELECT * FROM schema_migrations ORDER BY name")).rows;
                expect(afterHistory.filter(entry => beforeHistory.some(before => before.name === entry.name))).toEqual(beforeHistory);
                expect((await client.query("SELECT * FROM tasks ORDER BY id")).rows).toEqual(beforeTasks);
                expect((await client.query("SELECT * FROM baselines ORDER BY id")).rows).toEqual(beforeBaselines);
                expect((await client.query("SELECT * FROM site_photos ORDER BY id")).rows).toEqual(beforePhotos);
                expect((await client.query("SELECT * FROM journal_photos ORDER BY journal_id,photo_id")).rows).toEqual(beforeLinks);
                expect((await client.query("SELECT id,content,client_uuid,input_hash,revision,updated_at FROM site_journals ORDER BY id")).rows).toEqual(beforeJournal);
                expect((await client.query("SELECT is_locked,locked_at,locked_by FROM site_journals WHERE id=$1", [journal])).rows[0])
                    .toEqual({ is_locked: true, locked_at: new Date("2026-10-05T10:00:00Z"), locked_by: actor });
                if (branch === "sprint45") {
                    expect((await client.query("SELECT * FROM journal_writes ORDER BY operation_uuid")).rows).toEqual(beforeWrites);
                    expect((await client.query("SELECT system_role,is_active FROM users WHERE id=$1", [actor])).rows[0]).toEqual({ system_role: "super_admin", is_active: true });
                    expect((await client.query("SELECT is_locked,revision FROM journal_daily_info WHERE project_id=$1", [project])).rows[0]).toEqual({ is_locked: true, revision: 1 });
                }
                await expect(client.query("UPDATE site_journals SET content='Forbidden change' WHERE id=$1", [journal])).rejects.toMatchObject({ code: "23514" });
                await expect(runMigrations({ client, command: "down" })).rejects.toThrow(/preserve lock metadata/);
                expect((await client.query("SELECT * FROM schema_migrations ORDER BY name")).rows).toEqual(afterHistory);
                expect(await runMigrations({ client })).toEqual(["No pending migrations."]);
            });
        } finally {
            for (const name of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, name));
            fs.rmdirSync(directory);
        }
    });

    test("legacy repeated day locks normalize proven day flags while preserving individual and ambiguous locks", async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "construction-legacy-lock-migrations-"));
        for (const name of names.filter(name => name <= lockMigration)) fs.copyFileSync(path.join(source, name), path.join(directory, name));
        try {
            await withSchema(async client => {
                await runMigrations({ client, directory });
                const actors = (await client.query("INSERT INTO users(email,password_hash) VALUES('first-lock@merge.test','test-only'),('repeat-lock@merge.test','test-only') RETURNING id")).rows.map(row => row.id);
                const project = (await client.query("INSERT INTO projects(name) VALUES('Legacy repeated locks') RETURNING id")).rows[0].id;
                const item = (await client.query("INSERT INTO work_items(project_id,title) VALUES($1,'Legacy locked item') RETURNING id", [project])).rows[0].id;
                await client.query("INSERT INTO journal_daily_info(project_id,day,manpower,equipment,weather) VALUES($1,'2026-10-05',7,'Crane','Sunny')", [project]);
                const records = [];
                for (const content of ["day flag", "explicit individual flag", "ambiguous flag"]) {
                    records.push((await client.query("INSERT INTO site_journals(project_id,work_item_id,author_id,client_uuid,input_hash,day,time,content) VALUES($1,$2,$3,$4,'legacy-hash','2026-10-05','08:30',$5) RETURNING id", [project, item, actors[0], randomUUID(), content])).rows[0].id);
                }
                // The original S-24 day event set flags and wrote immutable
                // audits in one transaction, preserving PostgreSQL precision.
                await client.query("BEGIN");
                await client.query("UPDATE site_journals SET is_locked=TRUE,locked_at=CURRENT_TIMESTAMP,locked_by=$1", [actors[0]]);
                await client.query("UPDATE journal_daily_info SET is_locked=TRUE,locked_at=CURRENT_TIMESTAMP,locked_by=$1", [actors[0]]);
                await client.query("UPDATE site_journals SET locked_at='2026-10-01T10:00:00.123456Z' WHERE id=$1", [records[2]]);
                await client.query("INSERT INTO audit_logs(project_id,actor_id,module,action,object_id,after_value) VALUES($1,$2,'journal','lock_day','2026-10-05',$3)", [project, actors[0], { locked: true, day: "2026-10-05" }]);
                await client.query("INSERT INTO audit_logs(project_id,actor_id,module,action,object_id,after_value) VALUES($1,$2,'journal','lock_record',$3,$4)", [project, actors[0], String(records[1]), { is_locked: true }]);
                await client.query("INSERT INTO journal_day_locks(project_id,day,changed_by,locked) VALUES($1,'2026-10-05',$2,TRUE)", [project, actors[0]]);
                await client.query("COMMIT");
                const beforeFlags = (await client.query("SELECT id,is_locked,locked_at::text AS locked_at,locked_by FROM site_journals ORDER BY id")).rows;
                // Main's repeated-day request advanced only the day row/audit,
                // leaving true per-row flags at the preceding event timestamp.
                await client.query("BEGIN");
                await client.query("UPDATE journal_day_locks SET changed_by=$1,updated_at=CURRENT_TIMESTAMP WHERE project_id=$2", [actors[1], project]);
                await client.query("INSERT INTO audit_logs(project_id,actor_id,module,action,object_id,after_value) VALUES($1,$2,'journal','lock_day','2026-10-05',$3)", [project, actors[1], { locked: true, day: "2026-10-05" }]);
                await client.query("COMMIT");
                const currentDay = (await client.query("SELECT updated_at::text AS locked_at,changed_by AS locked_by FROM journal_day_locks WHERE project_id=$1", [project])).rows[0];
                expect(currentDay.locked_at).not.toBe(beforeFlags[0].locked_at);
                const beforeAudits = (await client.query("SELECT * FROM audit_logs ORDER BY id")).rows;
                expect(await runMigrations({ client })).toEqual(["Applied: 017_sprint4_5.sql", "Applied: 018_system_administration.sql", `Applied: ${reconciliation}`]);
                const upgradedFlags = (await client.query("SELECT id,is_locked,locked_at::text AS locked_at,locked_by FROM site_journals ORDER BY id")).rows;
                expect(upgradedFlags[0]).toEqual({ id: records[0], is_locked: true, ...currentDay });
                expect(upgradedFlags.slice(1)).toEqual(beforeFlags.slice(1));
                expect((await client.query("SELECT is_locked,locked_at::text AS locked_at,locked_by,revision,manpower FROM journal_daily_info")).rows[0])
                    .toEqual({ is_locked: true, ...currentDay, revision: 1, manpower: 7 });
                expect((await client.query("SELECT * FROM audit_logs ORDER BY id")).rows).toEqual(beforeAudits);
                await client.query("BEGIN");
                await createSiteManagementModel(client).setDayLock(project, "2026-10-05", actors[1], false, "Authorized legacy day unlock");
                await client.query("COMMIT");
                const unlockedFlags = (await client.query("SELECT id,is_locked,locked_at::text AS locked_at,locked_by FROM site_journals ORDER BY id")).rows;
                expect(unlockedFlags[0]).toEqual({ id: records[0], is_locked: false, locked_at: null, locked_by: null });
                expect(unlockedFlags.slice(1)).toEqual(beforeFlags.slice(1));
                expect((await client.query("SELECT is_locked,locked_at,locked_by,revision,manpower FROM journal_daily_info")).rows[0])
                    .toEqual({ is_locked: false, locked_at: null, locked_by: null, revision: 1, manpower: 7 });
                // Preserved individual locks still protect their shared header.
                expect((await createSiteManagementModel(client).daily(project, "2026-10-05")).is_locked).toBe(true);
            });
        } finally {
            for (const name of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, name));
            fs.rmdirSync(directory);
        }
    });

    test("both 017 migrations and 018/019 roundtrip in canonical order on an empty test schema", async () => {
        await withSchema(async client => {
            expect(await runMigrations({ client })).toEqual(names.map(name => `Applied: ${name}`));
            for (const name of names.slice(16).reverse()) {
                expect(await runMigrations({ client, command: "down" })).toEqual([`Rolled back: ${name}`]);
            }
            expect(await runMigrations({ client })).toEqual(names.slice(16).map(name => `Applied: ${name}`));
            expect(await runMigrations({ client })).toEqual(["No pending migrations."]);
        });
    });
});
