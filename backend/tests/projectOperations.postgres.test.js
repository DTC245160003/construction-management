const { Pool } = require("pg");
const request = require("supertest");
const { randomUUID } = require("node:crypto");
const { runMigrations } = require("../src/run-migration");
const { hashPassword } = require("../src/config/password");
const { operationsApp } = require("./helpers/operationsApp");
const describePostgres = process.env.SPRINT2_TEST_DATABASE_URL ? describe : describe.skip;

describePostgres("Project operations on real PostgreSQL with authenticated sessions", () => {
    const schema = `operations_test_${randomUUID().replaceAll("-", "")}`;
    let adminPool, pool, app, store, project, other, leaf, tasks, ownTeam, otherTeam;
    const users = {}, agents = {};
    const migrate = async (command) => {
        const client = await pool.connect();
        try { return await runMigrations({ client, command }); } finally { client.release(); }
    };
    const url = (suffix = "", id = project) => `/projects/${id}${suffix}`;
    beforeAll(async () => {
        adminPool = new Pool({ connectionString: process.env.SPRINT2_TEST_DATABASE_URL });
        await adminPool.query(`CREATE SCHEMA "${schema}"`);
        pool = new Pool({ connectionString: process.env.SPRINT2_TEST_DATABASE_URL, options: `-c search_path=${schema}` });
        await migrate("up");
        const password = "Real-session-test-123!";
        const hash = await hashPassword(password);
        // Deliberately different role IDs from the development database.
        for (const role of ["worker", "viewer", "accountant", "admin", "engineer", "project_manager"]) {
            const roleId = (await pool.query("INSERT INTO roles(name) VALUES($1) RETURNING id", [role])).rows[0].id;
            users[role] = (await pool.query("INSERT INTO users(fullname,email,password_hash,role_id) VALUES($1,$2,$3,$4) RETURNING id", [role, `${role}@operations.test`, hash, roleId])).rows[0].id;
        }
        users.outsider = (await pool.query("INSERT INTO users(fullname,email,password_hash,role_id) SELECT 'outsider','outsider@operations.test',$1,id FROM roles WHERE name='admin' RETURNING id", [hash])).rows[0].id;
        ({ app, store } = operationsApp(pool));
        for (const role of Object.keys(users)) {
            agents[role] = request.agent(app);
            await agents[role].post("/auth/login").send({ email: `${role}@operations.test`, password }).expect(200);
        }
    }, 30000);
    afterAll(async () => {
        if (store) await store.close();
        if (pool) await pool.end();
        if (adminPool) { await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await adminPool.end(); }
    });
    beforeEach(async () => {
        await pool.query("TRUNCATE projects CASCADE");
        [project, other] = (await pool.query("INSERT INTO projects(name,location,start_date) VALUES('Project A','Hà Nội','2026-10-03'),('Project B','Đà Nẵng','2026-10-05') RETURNING id")).rows.map((row) => row.id);
        for (const [role, userId] of Object.entries(users)) {
            if (role !== "outsider") await pool.query("INSERT INTO project_members(project_id,user_id,role_id) SELECT $1,$2,id FROM roles WHERE name=$3", [project, userId, role]);
        }
        await pool.query("INSERT INTO project_members(project_id,user_id,role_id) SELECT $1,$2,id FROM roles WHERE name='admin'", [other, users.outsider]);
        leaf = (await pool.query("INSERT INTO work_items(project_id,title) VALUES($1,'Móng') RETURNING id", [project])).rows[0].id;
        tasks = (await pool.query("INSERT INTO tasks(work_item_id,name,duration_days) SELECT $1,'Task ' || n,3 FROM generate_series(1,4) n RETURNING id", [leaf])).rows.map((row) => row.id);
        ownTeam = (await agents.project_manager.post(url("/teams")).send({ name: "Đội A", member_ids: [users.worker] }).expect(201)).body.team.id;
        otherTeam = (await agents.project_manager.post(url("/teams")).send({ name: "Đội B", member_ids: [users.engineer] }).expect(201)).body.team.id;
    });
    const assign = (task, team = ownTeam) => agents.project_manager.put(url(`/assignments/${task}`)).send({ team_id: team });
    const plan = (task, value = 10) => agents.project_manager.put(url(`/assignments/${task}/quantity`)).send({ planned_quantity: value, unit: "m³" });
    const report = (task, body) => agents.worker.post(url(`/assignments/${task}/progress`)).send(body);

    test("project list is membership scoped and legacy global admin cannot create or bypass project membership", async () => {
        await request(app).get("/projects").expect(401);
        const list = await agents.admin.get("/projects").expect(200);
        expect(list.body.projects.map((entry) => entry.id)).toEqual([project]);
        expect(list.body.projects[0]).toMatchObject({ member_count: 6, progress: null });
        const body = { name: "New project", location: "Hải Phòng", start_date: "2026-10-05" };
        await agents.project_manager.post("/projects").send(body).expect(403);
        await agents.admin.post("/projects").send(body).expect(403);
        expect(list.body.can_create).toBe(false);
        await agents.outsider.get(url("/overview")).expect(403);
        await agents.admin.get(url("/overview", other)).expect(403);
    });

    test("server uses current project role, ignores spoofed global/body role, and denies nonmember routes", async () => {
        for (const suffix of ["/overview", "/calendar", "/assignments", "/teams", "/notifications", "/audit-logs"]) {
            await agents.outsider.get(url(suffix)).expect(403);
        }
        await agents.worker.put(url("/calendar")).send({ working_days: [1], revision: 1, role: "admin" }).expect(403);
        await agents.viewer.put(url(`/assignments/${tasks[0]}`)).send({ team_id: ownTeam }).expect(403);
        await agents.accountant.get(url("/assignments")).expect(403);
        await pool.query("UPDATE project_members SET role_id=(SELECT id FROM roles WHERE name='worker') WHERE project_id=$1 AND user_id=$2", [project, users.admin]);
        await agents.admin.post(url("/teams")).send({ name: "Spoofed", member_ids: [users.admin], role: "admin" }).expect(403);
        await agents.admin.get(url("/audit-logs")).expect(403);
        await agents.worker.get("/auth/me").expect(200).expect((response) => expect(response.body.user.role).toBe("worker"));
    });

    test("member management uses project roles, persists invitations, accepts them on registration and protects the last manager", async () => {
        await request(app).get(url("/members")).expect(401);
        await agents.outsider.get(url("/members")).expect(403);
        await agents.worker.post(url("/members")).send({ email:"new@operations.test",role:"worker" }).expect(403);

        let result=await agents.admin.get(url("/members")).expect(200);
        expect(result.body.members).toHaveLength(6);
        expect(result.body.project).toMatchObject({ id:project,name:"Project A" });
        expect(result.body.can_manage).toBe(true);

        await agents.admin.post(url("/members")).send({ email:"outsider@operations.test",role:"viewer" }).expect(201)
            .expect((response) => expect(response.body.kind).toBe("member"));
        await agents.admin.post(url("/members")).send({ email:"outsider@operations.test",role:"viewer" }).expect(409);
        await agents.admin.patch(url(`/members/${users.outsider}`)).send({ role:"engineer" }).expect(200);
        expect((await agents.outsider.get(url("/members")).expect(200)).body.members.find((member) => member.id===users.outsider).role).toBe("engineer");
        await agents.outsider.patch(url(`/members/${users.worker}`)).send({ role:"admin" }).expect(403);

        const inviteResult=(await agents.admin.post(url("/members")).send({ email:"invited@operations.test",role:"worker" }).expect(201)).body;
        const invitation=inviteResult.invitation;
        await agents.admin.post(url("/members")).send({ email:"invited@operations.test",role:"worker" }).expect(409);
        result=await agents.admin.get(url("/members")).expect(200);
        expect(result.body.invitations).toHaveLength(1);

        await request(app).post("/auth/register").send({ fullname:"Invited user",email:"invited@operations.test",password:"Invited-user-123!",role:"viewer",invitation_token:new URL(inviteResult.acceptance_path,"http://test").searchParams.get("token") }).expect(201);
        const invited=(await pool.query("SELECT id FROM users WHERE email='invited@operations.test'")).rows[0];
        expect((await pool.query(`SELECT r.name AS role FROM project_members m JOIN roles r ON r.id=m.role_id
            WHERE m.project_id=$1 AND m.user_id=$2`,[project,invited.id])).rows[0].role).toBe("worker");
        expect((await pool.query("SELECT status,accepted_by FROM project_invitations WHERE id=$1",[invitation.id])).rows[0]).toMatchObject({ status:"accepted",accepted_by:invited.id });

        const pending=(await agents.admin.post(url("/members")).send({ email:"cancel@operations.test",role:"engineer" }).expect(201)).body.invitation;
        await agents.admin.delete(url(`/invitations/${pending.id}`)).expect(204);
        await agents.admin.delete(url(`/invitations/${pending.id}`)).expect(404);
        await agents.admin.delete(url(`/members/${users.outsider}`)).expect(204);

        await agents.project_manager.delete(url(`/members/${users.admin}`)).expect(204);
        await agents.project_manager.delete(url(`/members/${users.project_manager}`)).expect(409);
        const audit=(await agents.project_manager.get(url("/audit-logs")).expect(200)).body.entries;
        expect(audit.some((entry) => entry.action==="change_role" && entry.module==="members")).toBe(true);
        expect(audit.some((entry) => entry.action==="cancel_invitation" && entry.module==="members")).toBe(true);
    });

    test("calendar default, optimistic concurrent saves, real workday mapping and holiday duplicate/isolation", async () => {
        let result = await agents.project_manager.get(url("/assignments")).expect(200);
        expect(result.body.tasks[0]).toMatchObject({ start_date: "2026-10-03", finish_date: "2026-10-06" });
        const change = { working_days: [1,2,3,4,5], revision: 1 };
        const responses = await Promise.all([agents.admin.put(url("/calendar")).send(change), agents.project_manager.put(url("/calendar")).send(change)]);
        expect(responses.map((response) => response.status).sort()).toEqual([200,409]);
        expect((await pool.query("SELECT schedule_needs_recalc FROM projects WHERE id=$1", [project])).rows[0].schedule_needs_recalc).toBe(true);
        for (const working_days of [[], [1,1], [7], [null], ["1"]]) await agents.admin.put(url("/calendar")).send({ working_days, revision: 2 }).expect(400);
        const day = { day: "2026-10-05", name: "Ngày nghỉ", notes: "Công trường nghỉ" };
        const holiday = await agents.admin.post(url("/holidays")).send(day).expect(201);
        await agents.admin.post(url("/holidays")).send(day).expect(409);
        await agents.admin.post(url("/holidays")).send({ day: "2026-10-04", name: "Chủ nhật" }).expect(201);
        result = await agents.project_manager.get(url("/assignments")).expect(200);
        expect(result.body.tasks[0]).toMatchObject({ start_date: "2026-10-06", finish_date: "2026-10-08" });
        await agents.outsider.put(url(`/holidays/${holiday.body.holiday.id}`, other)).send(day).expect(404);
        await agents.admin.put(url(`/holidays/${holiday.body.holiday.id}`)).send({ ...day, name: "Đổi tên" }).expect(200);
        await agents.admin.delete(url(`/holidays/${holiday.body.holiday.id}`)).expect(204);
        result = await agents.project_manager.get(url("/assignments")).expect(200);
        expect(result.body.tasks[0].start_date).toBe("2026-10-05");
    });

    test("team creation validates members/project; four overlapping assignments warn but save and history is append-only", async () => {
        await agents.admin.post(url("/teams")).send({ name: "Foreign", member_ids: [users.outsider] }).expect(422);
        await agents.admin.post(url("/teams")).send({ name: "Đội A", member_ids: [users.worker] }).expect(409);
        const foreign = (await agents.outsider.post(url("/teams", other)).send({ name: "Foreign team", member_ids: [users.outsider] }).expect(201)).body.team.id;
        await assign(tasks[0], foreign).expect(404);
        for (const task of tasks.slice(0,3)) expect((await assign(task).expect(200)).body.warning).toBeNull();
        expect((await assign(tasks[3]).expect(200)).body.warning).toMatch(/4 công việc/);
        await assign(tasks[0], otherTeam).expect(200);
        const details = (await agents.admin.get(url(`/assignments/${tasks[0]}`)).expect(200)).body;
        expect(details.history).toHaveLength(2);
        expect(details.history[0]).toMatchObject({ previous_team_id: ownTeam, team_id: otherTeam });
        await expect(pool.query("UPDATE task_assignment_history SET team_id=$1", [ownTeam])).rejects.toMatchObject({ code: "23514" });
        expect((await assign(tasks[0], otherTeam).expect(200)).body.changed).toBe(false);
    });

    test("workers only see and mutate own assigned tasks; switching teams removes access", async () => {
        await assign(tasks[0]).expect(200); await assign(tasks[1], otherTeam).expect(200);
        const list = await agents.worker.get(url("/assignments")).expect(200);
        expect(list.body.tasks.map((entry) => entry.id)).toEqual([tasks[0]]);
        expect(list.body.teams.map((entry) => entry.id)).toEqual([ownTeam]);
        await agents.worker.get(url(`/assignments/${tasks[1]}`)).expect(403);
        await report(tasks[1], { day: "2026-10-05", quantity: 1, client_uuid: randomUUID() }).expect(403);
        await agents.worker.post(url(`/assignments/${tasks[1]}/issues`)).send({ description: "Foreign" }).expect(403);
        await assign(tasks[0], otherTeam).expect(200);
        await agents.worker.get(url(`/assignments/${tasks[0]}`)).expect(403);
    });

    test("progress requires plan, handles simultaneous idempotent retry, warns over plan and persists aggregated status", async () => {
        const task = tasks[0]; await assign(task).expect(200);
        const body = { day: "2026-10-05", quantity: 8, notes: "Đợt 1", client_uuid: randomUUID() };
        await report(task, body).expect(422); await plan(task).expect(200);
        const responses = await Promise.all([report(task, body), report(task, body)]);
        expect(responses.map((entry) => entry.status)).toEqual([201,201]);
        expect(responses.filter((entry) => entry.body.replayed)).toHaveLength(1);
        await report(task, { ...body, quantity: 9 }).expect(409);
        const extra = await report(task, { ...body, client_uuid: randomUUID(), quantity: 4 }).expect(201);
        expect(extra.body.warning).toMatch(/vượt/);
        expect(extra.body.total).toBe(12);
        expect((await agents.admin.get(url(`/assignments/${task}`))).body.progress).toHaveLength(2);
        await agents.admin.put(url(`/assignments/${task}/quantity`)).send({ planned_quantity: 10, unit: "tấn" }).expect(409);
        expect((await agents.worker.get(url("/assignments"))).body.tasks[0]).toMatchObject({ status: "completed", reported_quantity: 12 });
        for (const quantity of [0, -1, 0.00001, "2"]) await report(task, { ...body, client_uuid: randomUUID(), quantity }).expect(400);
        for (const id of tasks.slice(1)) await plan(id, 10).expect(200);
        expect((await agents.admin.get("/projects")).body.projects[0].progress).toBe(25);
    });

    test("issue submission notifies managers; close requires a note; notifications and immutable audit are scoped", async () => {
        await assign(tasks[0]).expect(200);
        const issue = (await agents.worker.post(url(`/assignments/${tasks[0]}/issues`)).send({ description: "Thiếu vật tư" }).expect(201)).body.issue;
        const feed = (await agents.project_manager.get(url("/notifications")).expect(200)).body;
        expect(feed.unread_count).toBe(1);
        expect(feed.notifications[0].target_path).toBe(`/field-assignments?projectId=${project}&taskId=${tasks[0]}`);
        await agents.worker.patch(url(`/notifications/${feed.notifications[0].id}/read`)).expect(404);
        await agents.project_manager.patch(url(`/notifications/${feed.notifications[0].id}/read`)).expect(200);
        expect((await agents.project_manager.get(url("/notifications"))).body.unread_count).toBe(0);
        await agents.admin.patch(url(`/issues/${issue.id}/close`)).send({ resolution: " " }).expect(400);
        await agents.worker.patch(url(`/issues/${issue.id}/close`)).send({ resolution: "Tự đóng" }).expect(403);
        const closes = await Promise.all([agents.admin.patch(url(`/issues/${issue.id}/close`)).send({ resolution: "Đã cấp vật tư" }), agents.project_manager.patch(url(`/issues/${issue.id}/close`)).send({ resolution: "Đã xử lý" })]);
        expect(closes.map((response) => response.status).sort()).toEqual([200,409]);
        const audit = (await agents.admin.get(url("/audit-logs"))).body.entries;
        expect(audit.filter((entry) => entry.action === "close_issue")).toHaveLength(1);
        await expect(pool.query("DELETE FROM audit_logs")).rejects.toMatchObject({ code: "23514" });
        expect((await migrate("down"))[0]).toContain("018_system_administration.sql");
        expect((await migrate("down"))[0]).toContain("017_sprint4_5.sql");
        expect((await migrate("down"))[0]).toContain("016_create_baselines_and_milestones.sql");
        expect((await migrate("down"))[0]).toContain("015_add_task_actuals.sql");
        expect((await migrate("down"))[0]).toContain("014_create_project_invitations.sql");
        expect((await migrate("down"))[0]).toContain("013_create_site_management.sql");
        await expect(migrate("down")).rejects.toThrow(/operational data/);
        await migrate("up");
    });

    test("012 rollback roundtrip works on unused schema without changing migrations 001–011", async () => {
        await pool.query("TRUNCATE projects CASCADE");
        expect((await migrate("down"))[0]).toContain("018_system_administration.sql");
        expect((await migrate("down"))[0]).toContain("017_sprint4_5.sql");
        expect((await migrate("down"))[0]).toContain("016_create_baselines_and_milestones.sql");
        expect((await migrate("down"))[0]).toContain("015_add_task_actuals.sql");
        expect((await migrate("down"))[0]).toContain("014_create_project_invitations.sql");
        expect((await migrate("down"))[0]).toContain("013_create_site_management.sql");
        expect((await migrate("down"))[0]).toContain("012_create_project_operations.sql");
        expect((await pool.query("SELECT count(*)::int AS count FROM schema_migrations")).rows[0].count).toBe(11);
        expect(await migrate("up")).toEqual(["Applied: 012_create_project_operations.sql", "Applied: 013_create_site_management.sql", "Applied: 014_create_project_invitations.sql", "Applied: 015_add_task_actuals.sql", "Applied: 016_create_baselines_and_milestones.sql", "Applied: 017_sprint4_5.sql", "Applied: 018_system_administration.sql"]);
    });
});
