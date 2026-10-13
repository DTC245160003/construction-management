const { Pool } = require("pg");
const express = require("express");
const request = require("supertest");
const { randomUUID } = require("node:crypto");
const { runMigrations } = require("../src/run-migration");
const { createTaskModel } = require("../src/models/taskModel");
const { createTaskRoutes } = require("../src/routes/taskRoutes");
const { createWorkItemCrudModel } = require("../src/models/workItemCrudModel");
const { createWorkItemRoutes } = require("../src/routes/workItemRoutes");
const { loadProjectGraph } = require("../src/services/scheduleService");
const { createScheduleService } = require("../src/services/scheduleService");
const { createScheduleModel } = require("../src/models/scheduleModel");
const { createScheduleRoutes } = require("../src/routes/scheduleRoutes");
const scenarios = require("./data/cpm-scenarios.json").filter((s) => ["K-01", "K-02", "K-03"].includes(s.id));
const errorHandler = require("../src/middleware/errorHandler");

// Opt in to a real PostgreSQL server. Each run owns an isolated schema;
// no application schema or rows are changed, including during rollback tests.
const describePostgres = process.env.SPRINT2_TEST_DATABASE_URL ? describe : describe.skip;

describePostgres("Sprint 2 real PostgreSQL constraints, migrations and API", () => {
    let admin;
    let pool;
    let app;
    let member;
    let model;
    let items;
    let project;
    let otherProject;
    const schema = `sprint2_test_${randomUUID().replaceAll("-", "")}`;
    const migrate = async (command) => {
        const client = await pool.connect();
        try {
            return await runMigrations({ client, command });
        } finally {
            client.release();
        }
    };

    beforeAll(async () => {
        admin = new Pool({ connectionString: process.env.SPRINT2_TEST_DATABASE_URL });
        await admin.query(`CREATE SCHEMA "${schema}"`);
        pool = new Pool({
            connectionString: process.env.SPRINT2_TEST_DATABASE_URL,
            options: `-c search_path=${schema}`
        });
        await migrate("up");
        model = createTaskModel(pool);
        const memberModel = { findByProjectAndUser: async () => member };
        const authorization = { requireAuth: (req, res, next) => {
            if (req.get("x-test-auth") === "none") return res.sendStatus(401);
            req.user = { id: 1 };
            next();
        } };
        app = express();
        app.set("env", "test");
        app.use(express.json());
        app.use("/projects", createTaskRoutes({ model, memberModel, authorization }));
        app.use("/projects", createWorkItemRoutes({ model: createWorkItemCrudModel(pool), memberModel, authorization }));
        app.use("/projects", createScheduleRoutes({ model: createScheduleModel(pool), memberModel, authorization }));
        app.use(errorHandler);
    });

    afterAll(async () => {
        if (pool) await pool.end();
        if (admin) {
            await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
            await admin.end();
        }
    });

    beforeEach(async () => {
        member = { role: "engineer" };
        await pool.query("TRUNCATE dependencies, tasks, work_items, projects CASCADE");
        [project, otherProject] = (await pool.query("INSERT INTO projects (name) VALUES ('Sprint 2'), ('Other') RETURNING id")).rows.map((row) => row.id);
        const parent = (await pool.query("INSERT INTO work_items (project_id, title) VALUES ($1, 'Parent') RETURNING id", [project])).rows[0].id;
        const leaf = (await pool.query("INSERT INTO work_items (project_id, parent_id, title) VALUES ($1, $2, 'Leaf') RETURNING id", [project, parent])).rows[0].id;
        const other = (await pool.query("INSERT INTO work_items (project_id, title) VALUES ($1, 'Other') RETURNING id", [otherProject])).rows[0].id;
        items = { parent, leaf, other };
    });

    const insertTask = async (name = "Task", workItemId = items.leaf, duration = 1) => (
        await pool.query("INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, $2, $3) RETURNING *", [workItemId, name, duration])
    ).rows[0];
    const insertDependency = (predecessor, successor, type = "FS", lag = 0) => pool.query(`
        INSERT INTO dependencies (predecessor_task_id, successor_task_id, dependency_type, lag_days)
        VALUES ($1, $2, $3, $4) RETURNING *
    `, [predecessor, successor, type, lag]);

    test("009/010 schema types, constraints and both dependency indexes exist", async () => {
        const { rows } = await pool.query(`
            SELECT table_name, column_name, data_type FROM information_schema.columns
            WHERE table_schema = $1 AND table_name IN ('tasks', 'dependencies')
        `, [schema]);
        for (const [table, column] of [["tasks", "work_item_id"], ["tasks", "duration_days"], ["dependencies", "lag_days"]]) {
            expect(rows.find((row) => row.table_name === table && row.column_name === column).data_type).toBe("integer");
        }
        const indexes = await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = 'dependencies'", [schema]);
        expect(indexes.rows.map((row) => row.indexname)).toEqual(expect.arrayContaining([
            "dependencies_predecessor_task_id_idx", "dependencies_successor_task_id_idx", "dependencies_pair_key"
        ]));
    });

    test("T-11 direct INSERT accepts 1, rejects zero, negative, fractional, null and invalid FK", async () => {
        expect((await insertTask()).duration_days).toBe(1);
        for (const duration of [0, -1]) {
            await expect(insertTask("Invalid", items.leaf, duration)).rejects.toMatchObject({ code: "23514" });
        }
        await expect(insertTask("Invalid", items.leaf, 1.5)).rejects.toMatchObject({ code: "22P02" });
        await expect(insertTask("Invalid", items.leaf, null)).rejects.toMatchObject({ code: "23502" });
        await expect(insertTask("Invalid", 2147483647)).rejects.toMatchObject({ code: "23503" });
    });

    test("T-13 all four types, negative/zero/positive lag; invalid type, self, duplicate and FK rejected", async () => {
        const source = await insertTask("Source");
        for (const [index, type] of ["FS", "SS", "FF", "SF"].entries()) {
            const target = await insertTask(type);
            const lag = [-2, 0, 3, -1][index];
            expect((await insertDependency(source.id, target.id, type, lag)).rows[0].lag_days).toBe(lag);
            await expect(insertDependency(source.id, target.id, "SF")).rejects.toMatchObject({ code: "23505" });
        }
        const target = await insertTask("Target");
        await expect(insertDependency(source.id, target.id, "XX")).rejects.toMatchObject({ code: "23514" });
        await expect(insertDependency(source.id, source.id)).rejects.toMatchObject({ code: "23514" });
        await expect(insertDependency(2147483647, target.id)).rejects.toMatchObject({ code: "23503" });
        await expect(insertDependency(source.id, 2147483647)).rejects.toMatchObject({ code: "23503" });
        await expect(insertDependency(source.id, target.id, "FS", 0.5)).rejects.toMatchObject({ code: "22P02" });
    });

    test("rollback refuses populated tables, then down 010/down 009/up succeeds without changing T-08", async () => {
        expect((await migrate("down"))[0]).toContain("019_reconcile_journal_lock_guards.sql");
        expect((await migrate("down"))[0]).toContain("018_system_administration.sql");
        expect((await migrate("down"))[0]).toContain("017_sprint4_5.sql");
        expect((await migrate("down"))[0]).toContain("017_add_lock_fields_to_daily_logs.sql");
        expect((await migrate("down"))[0]).toContain("016_create_baselines_and_milestones.sql");
        expect((await migrate("down"))[0]).toContain("015_add_task_actuals.sql");
        expect((await migrate("down"))[0]).toContain("014_create_project_invitations.sql");
        expect((await migrate("down"))[0]).toContain("013_create_site_management.sql");
        expect((await migrate("down"))[0]).toContain("012_create_project_operations.sql");
        // 011 now depends on tasks; roll it back first, retaining all 009/010 assertions.
        expect((await migrate("down"))[0]).toContain("011_create_schedule_results.sql");
        const first = await insertTask("First");
        const second = await insertTask("Second");
        await insertDependency(first.id, second.id);
        await expect(migrate("down")).rejects.toThrow(/dependencies contain data/);
        await pool.query("DELETE FROM dependencies");
        expect((await migrate("down"))[0]).toContain("010_create_dependencies.sql");
        await expect(migrate("down")).rejects.toThrow(/tasks contain data/);
        await pool.query("DELETE FROM tasks");
        expect((await migrate("down"))[0]).toContain("009_create_tasks.sql");
        expect((await pool.query("SELECT to_regclass('tasks') AS tasks, to_regclass('dependencies') AS dependencies")).rows[0])
            .toEqual({ tasks: null, dependencies: null });
        expect((await pool.query("SELECT count(*)::int AS count FROM work_items")).rows[0].count).toBe(3);
        expect(await migrate("up")).toEqual([
            "Applied: 009_create_tasks.sql", "Applied: 010_create_dependencies.sql", "Applied: 011_create_schedule_results.sql", "Applied: 012_create_project_operations.sql", "Applied: 013_create_site_management.sql", "Applied: 014_create_project_invitations.sql", "Applied: 015_add_task_actuals.sql", "Applied: 016_create_baselines_and_milestones.sql", "Applied: 017_add_lock_fields_to_daily_logs.sql", "Applied: 017_sprint4_5.sql", "Applied: 018_system_administration.sql", "Applied: 019_reconcile_journal_lock_guards.sql"
        ]);
    });

    test("T-12 API creates, lists, edits, blocks parent and cross-project items", async () => {
        const created = await request(app).post(`/projects/${project}/tasks`)
            .send({ work_item_id: items.leaf, name: "  Concrete  ", duration_days: 1 }).expect(201);
        const id = created.body.task.id;
        expect(created.body.task.name).toBe("Concrete");
        const updated = await request(app).patch(`/projects/${project}/tasks/${id}`)
            .send({ name: "Concrete updated", duration_days: 4 }).expect(200);
        expect(updated.body.task.duration_days).toBe(4);
        expect(updated.body.task.work_item_id).toBe(items.leaf);
        const list = await request(app).get(`/projects/${project}/tasks`).expect(200);
        expect(list.body.tasks).toHaveLength(1);
        await request(app).post(`/projects/${project}/tasks`)
            .send({ work_item_id: items.parent, name: "Invalid", duration_days: 1 }).expect(400);
        await request(app).patch(`/projects/${project}/tasks/${id}`)
            .send({ work_item_id: items.parent }).expect(400);
        await request(app).post(`/projects/${project}/tasks`)
            .send({ work_item_id: items.other, name: "Invalid", duration_days: 1 }).expect(404);
        await request(app).patch(`/projects/${otherProject}/tasks/${id}`)
            .send({ duration_days: 3 }).expect(404);
        await request(app).delete(`/projects/${project}/items/${items.leaf}`).expect(409);
        await request(app).post(`/projects/${project}/items`)
            .send({ title: "Cannot become parent", parentId: items.leaf }).expect(409);
        await request(app).patch(`/projects/${project}/items/${items.parent}`)
            .send({ title: "Reparenting", parentId: items.leaf }).expect(422);
    });

    test.each([0, -1, 1.5, null, "2", 2147483648])("T-12 API rejects duration %p on create and update", async (duration_days) => {
        const task = await insertTask();
        await request(app).post(`/projects/${project}/tasks`)
            .send({ work_item_id: items.leaf, name: "Invalid", duration_days }).expect(400);
        await request(app).patch(`/projects/${project}/tasks/${task.id}`).send({ duration_days }).expect(400);
        expect((await model.findById(project, task.id)).duration_days).toBe(1);
    });

    test("T-14 API supports all types, duplicate/self/type/lag errors and project isolation", async () => {
        const source = await insertTask("Source");
        for (const type of ["FS", "SS", "FF", "SF"]) {
            const target = await insertTask(type);
            const endpoint = `/projects/${project}/tasks/${target.id}/dependencies`;
            const values = { predecessor_task_id: source.id, dependency_type: type, lag_days: -2 };
            const created = await request(app).post(endpoint).send(values).expect(201);
            expect(created.body.dependency.lag_days).toBe(-2);
            const duplicate = await request(app).post(endpoint).send({ ...values, dependency_type: "SF" }).expect(409);
            expect(duplicate.body.message).toMatch(/đã có/);
        }
        const endpoint = `/projects/${project}/tasks/${source.id}/dependencies`;
        const target = await insertTask("Other", items.other);
        await request(app).post(endpoint).send({ predecessor_task_id: source.id, dependency_type: "FS" }).expect(400);
        await request(app).post(endpoint).send({ predecessor_task_id: target.id, dependency_type: "XX" }).expect(400);
        await request(app).post(endpoint).send({ predecessor_task_id: target.id, dependency_type: "FS", lag_days: 0.5 }).expect(400);
        await request(app).post(endpoint).send({ predecessor_task_id: target.id, dependency_type: "FS" }).expect(404);
        await request(app).post(`/projects/${project}/tasks/${target.id}/dependencies`)
            .send({ predecessor_task_id: source.id, dependency_type: "FS" }).expect(404);
        const list = await request(app).get(`/projects/${project}/dependencies`).expect(200);
        expect(list.body.dependencies).toHaveLength(4);
        const dependency = list.body.dependencies[0];
        await request(app).delete(`/projects/${otherProject}/tasks/${dependency.successor_task_id}/dependencies/${dependency.id}`).expect(404);
        await request(app).delete(`/projects/${project}/tasks/${dependency.successor_task_id}/dependencies/${dependency.id}`).expect(204);
    });

    test("task and dependency endpoints require authentication and project membership", async () => {
        for (const path of ["tasks", "dependencies"]) {
            await request(app).get(`/projects/${project}/${path}`).set("x-test-auth", "none").expect(401);
            member = null;
            await request(app).get(`/projects/${project}/${path}`).expect(403);
            member = { role: "viewer" };
            await request(app).get(`/projects/${project}/${path}`).expect(200);
        }
    });

    test("T-15 executes exactly two real SELECTs and excludes another project", async () => {
        const first = await insertTask("First");
        const second = await insertTask("Second");
        await insertTask("Foreign", items.other);
        await insertDependency(first.id, second.id);
        const query = jest.fn((...args) => pool.query(...args));
        const graph = await loadProjectGraph({ query }, project);
        expect(query).toHaveBeenCalledTimes(2);
        expect([...graph.tasks.keys()]).toEqual([first.id, second.id]);
        expect(graph.adjacency.get(first.id)).toEqual([second.id]);
        expect(graph.reverseAdjacency.get(second.id)).toEqual([first.id]);
        expect(graph.indegree.get(second.id)).toBe(1);
    });

    test("concurrent task creation and adding a child cannot leave tasks on a parent", async () => {
        const leaf = (await pool.query("INSERT INTO work_items (project_id, title) VALUES ($1, 'Race') RETURNING id", [project])).rows[0].id;
        const results = await Promise.all([
            request(app).post(`/projects/${project}/tasks`).send({ work_item_id: leaf, name: "Race task", duration_days: 1 }),
            request(app).post(`/projects/${project}/items`).send({ parentId: leaf, title: "Race child" })
        ]);
        expect(results.filter((response) => response.status === 201)).toHaveLength(1);
        expect(results.filter((response) => [400, 409].includes(response.status))).toHaveLength(1);
    });

    const dirty = async (projectId = project) => (await pool.query(
        "SELECT schedule_needs_recalc FROM projects WHERE id = $1", [projectId]
    )).rows[0].schedule_needs_recalc;
    const storedResults = async () => (await pool.query("SELECT * FROM schedule_results ORDER BY task_id")).rows;
    const scheduleUrl = () => `/projects/${project}/schedule`;

    test("T-24/T-25 rejects C -> A with named cycle and preserves both dependencies and clean cache", async () => {
        const a = await insertTask("Đào móng");
        const b = await insertTask("Lắp thép");
        const c = await insertTask("Đổ bê tông");
        await insertDependency(a.id, b.id);
        await insertDependency(b.id, c.id);
        await request(app).get(scheduleUrl()).expect(200);
        const before = await storedResults();
        const response = await request(app).post(`/projects/${project}/tasks/${a.id}/dependencies`)
            .send({ predecessor_task_id: c.id, dependency_type: "FS", lag_days: -100 }).expect(422);
        expect(response.body.cycle).toEqual([
            { id: a.id, name: a.name }, { id: c.id, name: c.name }, { id: b.id, name: b.name }
        ]);
        expect(response.body.message).toContain(`"${a.name}" chờ "${c.name}"`);
        expect(response.body.message).toContain(`"${c.name}" chờ "${b.name}"`);
        expect(response.body.message).toContain(`"${b.name}" lại chờ "${a.name}"`);
        expect((await model.listDependencies(project))).toHaveLength(2);
        expect(await storedResults()).toEqual(before);
        expect(await dirty()).toBe(false);
    });

    test("T-24 serializes two concurrent edges whose combined graph would cycle", async () => {
        const a = await insertTask("A");
        const b = await insertTask("B");
        const c = await insertTask("C");
        await insertDependency(a.id, b.id);
        const responses = await Promise.all([
            request(app).post(`/projects/${project}/tasks/${c.id}/dependencies`)
                .send({ predecessor_task_id: b.id, dependency_type: "FS" }),
            request(app).post(`/projects/${project}/tasks/${a.id}/dependencies`)
                .send({ predecessor_task_id: c.id, dependency_type: "SS" })
        ]);
        expect(responses.map((response) => response.status).sort()).toEqual([201, 422]);
        expect(await model.listDependencies(project)).toHaveLength(2);
    });

    test.each(scenarios)("T-27 API matches every hand-calculated result for $id and sorts by ES", async (scenario) => {
        const idMap = new Map();
        for (const task of scenario.tasks) {
            idMap.set(task.id, (await insertTask(task.name, items.leaf, task.duration_days)).id);
        }
        for (const edge of scenario.dependencies) {
            await insertDependency(idMap.get(edge.predecessor_task_id), idMap.get(edge.successor_task_id), edge.dependency_type, edge.lag_days);
        }
        await insertTask("Outside project", items.other);
        const response = await request(app).get(scheduleUrl()).expect(200);
        expect(response.body.schedule).toHaveLength(scenario.tasks.length);
        for (const expected of scenario.expected) {
            const task = scenario.tasks.find((entry) => entry.id === expected.id);
            const actual = response.body.schedule.find((entry) => entry.id === idMap.get(expected.id));
            expect(actual).toMatchObject({ ...expected, id: idMap.get(expected.id), name: task.name,
                duration_days: task.duration_days, work_item_id: items.leaf });
        }
        const starts = response.body.schedule.map((entry) => entry.es);
        expect(starts).toEqual([...starts].sort((a, b) => a - b));
        const critical = await request(app).get(`${scheduleUrl()}?critical=true`).expect(200);
        expect(critical.body.schedule).toEqual(response.body.schedule.filter((entry) => entry.isCritical));
        expect(await dirty()).toBe(false);
        expect(await dirty(otherProject)).toBe(true);
    });

    test("T-26 clean cache reuses rows without graph reads, CPM or writes", async () => {
        await insertTask("A");
        await request(app).get(scheduleUrl()).expect(200);
        const before = await storedResults();
        const statements = [];
        const trackedPool = { connect: async () => {
            const client = await pool.connect();
            return { query: (sql, values) => { statements.push(sql); return client.query(sql, values); }, release: () => client.release() };
        } };
        const service = createScheduleService({ model: createScheduleModel(trackedPool) });
        expect(await service.getSchedule(project)).toHaveLength(1);
        expect(statements.filter((sql) => /SELECT/.test(sql))).toHaveLength(4); // lock + ongoing check + milestones + cached rows
        expect(statements.some((sql) => /FROM dependencies|SELECT t\.\*|INSERT|DELETE|UPDATE projects/.test(sql))).toBe(false);
        expect(await storedResults()).toEqual(before);
    });

    test("T-26 task create/update and dependency create/delete mark dirty and recalculate", async () => {
        await request(app).get(scheduleUrl()).expect(200);
        expect(await dirty()).toBe(false);
        const a = (await request(app).post(`/projects/${project}/tasks`)
            .send({ name: "A", work_item_id: items.leaf, duration_days: 3 }).expect(201)).body.task;
        expect(await dirty()).toBe(true);
        expect((await request(app).get(scheduleUrl()).expect(200)).body.schedule[0].ef).toBe(3);
        await request(app).patch(`/projects/${project}/tasks/${a.id}`).send({ name: "A updated", duration_days: 5 }).expect(200);
        expect(await dirty()).toBe(true);
        const afterUpdate = (await request(app).get(scheduleUrl()).expect(200)).body.schedule;
        expect(afterUpdate[0]).toMatchObject({ name: "A updated", ef: 5 });
        const b = await insertTask("B", items.leaf, 2);
        await request(app).get(scheduleUrl()).expect(200);
        const edge = (await request(app).post(`/projects/${project}/tasks/${b.id}/dependencies`)
            .send({ predecessor_task_id: a.id, dependency_type: "FS" }).expect(201)).body.dependency;
        expect(await dirty()).toBe(true);
        const linked = (await request(app).get(scheduleUrl()).expect(200)).body.schedule;
        expect(linked.find((task) => task.id === b.id).es).toBe(5);
        await request(app).delete(`/projects/${project}/tasks/${b.id}/dependencies/${edge.id}`).expect(204);
        expect(await dirty()).toBe(true);
        const unlinked = (await request(app).get(scheduleUrl()).expect(200)).body.schedule;
        expect(unlinked.find((task) => task.id === b.id)).toMatchObject({ es: 0, slack: 3, isCritical: false });
        expect(await dirty()).toBe(false);
    });

    test("T-26 failed bulk write rolls back the entire cache and leaves project dirty", async () => {
        const task = await insertTask("A");
        await request(app).get(scheduleUrl()).expect(200);
        const before = await storedResults();
        await pool.query("UPDATE tasks SET duration_days = 6 WHERE id = $1", [task.id]);
        const failingPool = { connect: async () => {
            const client = await pool.connect();
            return {
                query: (sql, values) => /INSERT INTO schedule_results/.test(sql)
                    ? Promise.reject(new Error("Injected bulk write failure")) : client.query(sql, values),
                release: () => client.release()
            };
        } };
        await expect(createScheduleService({ model: createScheduleModel(failingPool) }).getSchedule(project))
            .rejects.toThrow("Injected bulk write failure");
        expect(await storedResults()).toEqual(before);
        expect(await dirty()).toBe(true);
        expect((await request(app).get(scheduleUrl()).expect(200)).body.schedule[0].ef).toBe(6);
    });

    test("T-26 concurrent GETs calculate once; task write during calculation is not lost", async () => {
        const task = await insertTask("A");
        let inserts = 0;
        const trackedPool = { connect: async () => {
            const client = await pool.connect();
            return { query: (sql, values) => {
                if (/INSERT INTO schedule_results/.test(sql)) inserts++;
                return client.query(sql, values);
            }, release: () => client.release() };
        } };
        const service = createScheduleService({ model: createScheduleModel(trackedPool) });
        const [first, second] = await Promise.all([service.getSchedule(project), service.getSchedule(project)]);
        expect(inserts).toBe(1);
        expect(first).toEqual(second);
        await Promise.all([
            service.getSchedule(project),
            request(app).patch(`/projects/${project}/tasks/${task.id}`).send({ duration_days: 7 }).expect(200)
        ]);
        expect((await service.getSchedule(project))[0].ef).toBe(7);
        expect(await dirty()).toBe(false);
    });

    test("T-27 dirty cycle returns 422 with names without replacing existing results", async () => {
        const a = await insertTask("Móng");
        const b = await insertTask("Tường");
        const tail = await insertTask("Hoàn thiện");
        await insertDependency(a.id, b.id);
        await insertDependency(b.id, tail.id);
        await request(app).get(scheduleUrl()).expect(200);
        const before = await storedResults();
        // Simulate a legacy/imported cycle that bypassed the HTTP guard.
        await insertDependency(b.id, a.id);
        const response = await request(app).get(scheduleUrl()).expect(422);
        expect(new Set(response.body.cycle.map((task) => task.name))).toEqual(new Set([a.name, b.name]));
        expect(response.body.message).not.toContain(tail.name);
        expect(await storedResults()).toEqual(before);
        expect(await dirty()).toBe(true);
    });

    test("T-27 empty project, query validation, authentication and membership", async () => {
        await request(app).get(scheduleUrl()).expect(200, { schedule: [] });
        expect(await dirty()).toBe(false);
        await request(app).get(`${scheduleUrl()}?critical=true`).expect(200, { schedule: [] });
        await request(app).get(`${scheduleUrl()}?critical=invalid`).expect(400);
        await request(app).get(scheduleUrl()).set("x-test-auth", "none").expect(401);
        member = null;
        await request(app).get(scheduleUrl()).expect(403);
        member = { role: "viewer" };
        await request(app).get(scheduleUrl()).expect(200); // Current T41–T45 read policy includes investors.
    });

    test("011 schema enforces one result per task, FK, down protection and re-up", async () => {
        expect((await migrate("down"))[0]).toContain("019_reconcile_journal_lock_guards.sql");
        expect((await migrate("down"))[0]).toContain("018_system_administration.sql");
        expect((await migrate("down"))[0]).toContain("017_sprint4_5.sql");
        expect((await migrate("down"))[0]).toContain("017_add_lock_fields_to_daily_logs.sql");
        expect((await migrate("down"))[0]).toContain("016_create_baselines_and_milestones.sql");
        expect((await migrate("down"))[0]).toContain("015_add_task_actuals.sql");
        expect((await migrate("down"))[0]).toContain("014_create_project_invitations.sql");
        expect((await migrate("down"))[0]).toContain("013_create_site_management.sql");
        expect((await migrate("down"))[0]).toContain("012_create_project_operations.sql");
        const task = await insertTask("A");
        const duplicate = (id) => pool.query(`
            INSERT INTO schedule_results (task_id, early_start, early_finish, late_start, late_finish, total_float, is_critical)
            VALUES ($1, 0, 1, 0, 1, 0, TRUE)
        `, [id]);
        await duplicate(task.id);
        await expect(duplicate(task.id)).rejects.toMatchObject({ code: "23505" });
        await expect(duplicate(2147483647)).rejects.toMatchObject({ code: "23503" });
        await expect(migrate("down")).rejects.toThrow(/schedule_results contain data/);
        await pool.query("DELETE FROM schedule_results");
        expect((await migrate("down"))[0]).toContain("011_create_schedule_results.sql");
        expect((await pool.query("SELECT to_regclass('schedule_results') AS name")).rows[0].name).toBeNull();
        expect(await model.list(project)).toHaveLength(1);
        expect(await migrate("up")).toEqual(["Applied: 011_create_schedule_results.sql", "Applied: 012_create_project_operations.sql", "Applied: 013_create_site_management.sql", "Applied: 014_create_project_invitations.sql", "Applied: 015_add_task_actuals.sql", "Applied: 016_create_baselines_and_milestones.sql", "Applied: 017_add_lock_fields_to_daily_logs.sql", "Applied: 017_sprint4_5.sql", "Applied: 018_system_administration.sql", "Applied: 019_reconcile_journal_lock_guards.sql"]);
        expect(await dirty()).toBe(true);
        await request(app).get(scheduleUrl()).expect(200);
    });

    test("schedule stores cumulative day offsets larger than PostgreSQL INTEGER", async () => {
        const first = await insertTask("Long", items.leaf, 2147483647);
        const second = await insertTask("Next", items.leaf, 2);
        await insertDependency(first.id, second.id);
        const response = await request(app).get(scheduleUrl()).expect(200);
        expect(response.body.schedule.find((task) => task.id === second.id).ef).toBe(2147483649);
    });
});
