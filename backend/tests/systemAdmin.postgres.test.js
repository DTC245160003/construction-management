const { Pool }=require("pg");
const request=require("supertest");
const { randomUUID }=require("node:crypto");
const { runMigrations }=require("../src/run-migration");
const { after019Applied,rollbackAfter019 }=require("./helpers/migrationVersions");
const { hashPassword }=require("../src/config/password");
const { operationsApp }=require("./helpers/operationsApp");
const { bootstrapConfig,bootstrapAdmin }=require("../scripts/admin-bootstrap.cjs");

test("bootstrap requires exact database, valid email, supported action and matching confirmation",() => {
  expect(() => bootstrapConfig({},["--email=user@test.example"])).toThrow(/database/);
  expect(() => bootstrapConfig({},['--database=x"; DROP DATABASE x;','--email=user@test.example'])).toThrow(/database/);
  expect(() => bootstrapConfig({},["--database=demo","--email=invalid"])).toThrow(/account/);
  expect(() => bootstrapConfig({},["--database=demo","--email=user@test.example","--action=delete"])).toThrow(/Action/);
  const args=["--database=demo","--email=USER@test.example"];
  expect(bootstrapConfig({},args)).toMatchObject({ email:"user@test.example",confirmed:false,confirmation:"GRANT_SUPER_ADMIN:demo:user@test.example" });
  expect(bootstrapConfig({},[...args,"--confirm=GRANT_SUPER_ADMIN:other:user@test.example"])).toMatchObject({ confirmed:false });
  expect(bootstrapConfig({},[...args,"--confirm=GRANT_SUPER_ADMIN:demo:user@test.example"])).toMatchObject({ confirmed:true });
});
const describeDb=process.env.SPRINT2_TEST_DATABASE_URL ? describe : describe.skip;
describeDb("Two-level system and project RBAC on real PostgreSQL",() => {
  const schema=`system_admin_${randomUUID().replaceAll("-","")}`,users={},agents={};
  let admin,pool,store,app,database,pid,other,item,hash;
  const password="System-admin-fixture-only-123!",email=name => `${name}@system.test`,url=suffix => `/projects/${pid}${suffix}`;
  const grant=name => bootstrapAdmin(pool,{ email:email(name),action:"grant",confirmed:true,database,operator:"integration-test" });
  beforeAll(async () => {
    admin=new Pool({ connectionString:process.env.SPRINT2_TEST_DATABASE_URL }); await admin.query(`CREATE SCHEMA "${schema}"`);
    pool=new Pool({ connectionString:process.env.SPRINT2_TEST_DATABASE_URL,options:`-c search_path=${schema}` });
    database=(await pool.query("SELECT current_database() AS name")).rows[0].name;
    const c=await pool.connect(); try { await runMigrations({ client:c }); } finally { c.release(); }
    hash=await hashPassword(password);
    for (const name of ["admin","project_manager","engineer","worker","accountant","viewer","outsider","root","root2"]) {
      const role=["root","root2","outsider"].includes(name) ? "engineer" : name;
      const r=(await pool.query("INSERT INTO roles(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id",[role])).rows[0];
      users[name]=(await pool.query("INSERT INTO users(fullname,email,password_hash,role_id) VALUES($1,$2,$3,$4) RETURNING id",[name,email(name),hash,r.id])).rows[0].id;
    }
    ({ app,store }=operationsApp(pool));
    for (const name of Object.keys(users)) { agents[name]=request.agent(app); await agents[name].post("/auth/login").send({ email:email(name),password }).expect(200); }
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE projects CASCADE");
    [pid,other]=(await pool.query("INSERT INTO projects(name,location,start_date) VALUES('A','Test','2026-10-01'),('B','Test','2026-10-01') RETURNING id")).rows.map(p => p.id);
    for (const name of ["project_manager","engineer","worker","accountant","viewer"]) await pool.query("INSERT INTO project_members(project_id,user_id,role_id) SELECT $1,id,role_id FROM users WHERE id=$2",[pid,users[name]]);
    await pool.query("INSERT INTO project_members(project_id,user_id,role_id) SELECT $1,id,role_id FROM users WHERE id=$2",[other,users.outsider]);
    item=(await pool.query("INSERT INTO work_items(project_id,title) VALUES($1,'Móng') RETURNING id",[pid])).rows[0].id;
  });
  afterAll(async () => { if (store) await store.close(); if (pool) await pool.end(); if (admin) { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end(); } });

  test("registration defaults to ordinary user, ignores injected system flags and never auto-joins a project",async () => {
    const payload={ fullname:"Normal user",email:`new-${randomUUID()}@test.example`,password,is_admin:true,system_role:"super_admin",role_id:1,project_id:pid };
    const response=await request(app).post("/auth/register").send(payload).expect(201);
    expect(response.body.user.system_role).toBe("user");
    expect((await pool.query("SELECT system_role FROM users WHERE id=$1",[response.body.user.id])).rows[0].system_role).toBe("user");
    expect((await pool.query("SELECT 1 FROM project_members WHERE user_id=$1",[response.body.user.id])).rowCount).toBe(0);
    for (const role of ["super_admin","admin","project_manager","manager"]) await request(app).post("/auth/register").send({ ...payload,email:`bad-${randomUUID()}@test.example`,role }).expect(403);
  });
  test("legacy global admin and ordinary accounts cannot create projects or use system administration",async () => {
    for (const name of ["admin","engineer","worker","root"]) {
      await agents[name].get("/admin/users?role=super_admin").set("X-Role","super_admin").expect(403);
      await agents[name].post("/projects").send({ name:"Denied",location:"Test",start_date:"2026-10-01" }).expect(403);
    }
  });
  test("manual CLI service checks confirmation and target, grants an existing account atomically and audits once",async () => {
    await expect(bootstrapAdmin(pool,{ email:email("root"),action:"grant",confirmed:false,database })).rejects.toThrow(/confirmation/);
    await expect(bootstrapAdmin(pool,{ email:email("root"),action:"grant",confirmed:true,database:"wrong" })).rejects.toThrow(/match/);
    await expect(bootstrapAdmin(pool,{ email:"missing@test.example",action:"grant",confirmed:true,database })).rejects.toThrow(/already exist/);
    expect(await grant("root")).toMatchObject({ changed:true,system_role:"super_admin" });
    expect(await grant("root")).toMatchObject({ changed:false });
    expect((await pool.query("SELECT password_hash,role_id FROM users WHERE id=$1",[users.root])).rows[0].password_hash).toBe(hash);
    expect((await pool.query("SELECT 1 FROM project_members WHERE user_id=$1",[users.root])).rowCount).toBe(0);
    expect((await pool.query("SELECT 1 FROM audit_logs WHERE module='system_admin' AND action='grant_super_admin'")).rowCount).toBe(1);
    expect((await agents.root.get("/auth/me").expect(200)).body.user.system_role).toBe("super_admin");
    const all=(await agents.root.get("/admin/users").expect(200)).body.users;
    expect(all.length).toBeGreaterThanOrEqual(9); expect(JSON.stringify(all)).not.toContain(hash);
  });
  test("Super Admin sees every project, creates projects and grants project management without granting system privileges",async () => {
    expect((await agents.root.get("/projects").expect(200)).body).toMatchObject({ can_create:true });
    expect((await agents.root.get("/projects")).body.projects.map(p => p.id).sort()).toEqual([pid,other].sort());
    await agents.root.get(`/projects/${other}/overview`).expect(200);
    await agents.root.post("/projects").send({ name:"Bad",location:"Test",start_date:"2026-02-30" }).expect(400);
    const created=(await agents.root.post("/projects").send({ name:"Root project",location:"Test",start_date:"2026-10-01" }).expect(201)).body.project;
    expect((await agents.root.get(`/projects/${created.id}/overview`)).body.project.member_role).toBe("admin");
    expect((await agents.root.get(`/projects/${created.id}/calendar`)).body.calendar.working_days).toEqual([1,2,3,4,5,6]);
    expect((await agents.root.get("/projects")).body.projects.some(p => p.id===created.id)).toBe(true);
    await agents.root.post(`/admin/projects/${pid}/members`).send({ email:email("admin"),role:"admin" }).expect(201);
    expect((await agents.admin.get("/auth/me")).body.user.system_role).toBe("user");
    await agents.admin.post(url("/members")).send({ email:email("outsider"),role:"engineer" }).expect(201);
    await agents.admin.post(`/projects/${other}/members`).send({ email:email("root2"),role:"admin" }).expect(403);
  });
  test("project grants and role changes are effective in the existing session; removal immediately revokes access",async () => {
    await agents.admin.get(url("/journals")).expect(403);
    await agents.root.post(`/admin/projects/${pid}/members`).send({ email:email("admin"),role:"viewer" }).expect(201);
    await agents.admin.get(url("/journals")).expect(200);
    await agents.admin.post(url("/journals")).send({}).expect(403);
    await agents.root.patch(`/admin/projects/${pid}/members/${users.admin}`).send({ role:"engineer" }).expect(200);
    expect((await agents.admin.get(url("/overview"))).body.project.member_role).toBe("engineer");
    await agents.root.delete(`/admin/projects/${pid}/members/${users.admin}`).expect(204);
    await agents.admin.get(url("/journals")).expect(403);
    await agents.engineer.get(`/projects/${other}/journals`).expect(403);
  });
  test("viewer reads task/dependency/tree/Gantt without write privileges; accountant has finance but no schedule access",async () => {
    for (const endpoint of ["/items","/tasks","/dependencies","/schedule"]) await agents.viewer.get(url(endpoint)).expect(200);
    await agents.viewer.post(url("/items")).send({ title:"Denied" }).expect(403);
    await agents.viewer.post(url("/tasks")).send({ work_item_id:item,name:"Denied",duration_days:1 }).expect(403);
    await agents.viewer.post(url("/baselines")).send({}).expect(403);
    await agents.accountant.get(url("/payments")).expect(200);
    await agents.accountant.get(url("/costs")).expect(200);
    await agents.accountant.get(url("/schedule")).expect(403);
    await agents.accountant.get(url("/journals")).expect(403);
    await agents.engineer.get(url("/payments")).expect(403);
  });
  test("worker sees and reports only assigned team work, has no system administration or Gantt privileges",async () => {
    const t=(await pool.query("INSERT INTO tasks(work_item_id,name,duration_days) VALUES($1,'Assigned',2) RETURNING id",[item])).rows[0].id;
    const team=(await agents.project_manager.post(url("/teams")).send({ name:"Team",member_ids:[users.worker] }).expect(201)).body.team.id;
    await agents.project_manager.put(url(`/assignments/${t}`)).send({ team_id:team }).expect(200);
    await agents.project_manager.put(url(`/assignments/${t}/quantity`)).send({ planned_quantity:10,unit:"m³" }).expect(200);
    expect((await agents.worker.get(url("/assignments")).expect(200)).body.tasks.map(x => x.id)).toEqual([t]);
    await agents.worker.post(url(`/assignments/${t}/progress`)).send({ day:"2026-10-05",quantity:2,client_uuid:randomUUID(),notes:"Done" }).expect(201);
    await agents.worker.get("/admin/users").expect(403); await agents.worker.get(url("/schedule")).expect(403);
  });
  test("account deactivation invalidates existing sessions without deleting business data; system API rejects role injection",async () => {
    await agents.root.patch(`/admin/users/${users.engineer}`).send({ is_active:false }).expect(200);
    await agents.engineer.get(url("/journals")).expect(401);
    await request(app).post("/auth/login").send({ email:email("engineer"),password }).expect(401);
    await agents.root.patch(`/admin/users/${users.engineer}`).send({ is_active:true }).expect(200);
    await agents.engineer.get(url("/journals")).expect(200);
    await agents.root.patch(`/admin/users/${users.engineer}`).send({ system_role:"super_admin" }).expect(403);
    await expect(pool.query("UPDATE audit_logs SET after_value='{}' WHERE module='system_admin'")).rejects.toMatchObject({ code:"23514" });
    expect((await agents.root.get("/admin/audit-logs").expect(200)).body.entries.some(e => e.action==="account_status")).toBe(true);
    expect((await agents.root.get("/admin/users?q=engineer")).body.users.every(u => u.email.includes("engineer"))).toBe(true);
  });
  test("last Super Admin cannot be deleted, demoted or disabled, including direct SQL",async () => {
    await agents.root.patch(`/admin/users/${users.root}`).send({ is_active:false }).expect(409);
    await agents.root.patch(`/admin/users/${users.root}`).send({ system_role:"user" }).expect(403);
    await agents.root.delete(`/admin/users/${users.root}`).expect(405);
    for (const sql of ["DELETE FROM users WHERE id=$1","UPDATE users SET system_role='user' WHERE id=$1","UPDATE users SET is_active=FALSE WHERE id=$1"]) await expect(pool.query(sql,[users.root])).rejects.toMatchObject({ code:"23514" });
  });
  test("018 rollback refuses privilege/audit loss and roundtrips on a separate empty schema",async () => {
    const c=await pool.connect(); try { await rollbackAfter019(command => runMigrations({ client:c,command })); await runMigrations({ client:c,command:"down" }); await expect(runMigrations({ client:c,command:"down" })).rejects.toThrow(/preserve privileges/); await runMigrations({ client:c }); } finally { c.release(); }
    const empty=`empty_admin_${randomUUID().replaceAll("-","")}`;
    await admin.query(`CREATE SCHEMA "${empty}"`);
    const isolated=new Pool({ connectionString:process.env.SPRINT2_TEST_DATABASE_URL,options:`-c search_path=${empty}` });
    const x=await isolated.connect();
    try { await runMigrations({ client:x }); await rollbackAfter019(command => runMigrations({ client:x,command })); expect(await runMigrations({ client:x,command:"down" })).toEqual(["Rolled back: 019_reconcile_journal_lock_guards.sql"]); expect(await runMigrations({ client:x,command:"down" })).toEqual(["Rolled back: 018_system_administration.sql"]); expect(await runMigrations({ client:x })).toEqual(["Applied: 018_system_administration.sql","Applied: 019_reconcile_journal_lock_guards.sql",...after019Applied]); }
    finally { x.release(); await isolated.end(); await admin.query(`DROP SCHEMA "${empty}" CASCADE`); }
  });
  test("concurrent demotions of two Super Admins leave exactly one active administrator",async () => {
    await grant("root2");
    const results=await Promise.allSettled([users.root,users.root2].map(id => pool.query("UPDATE users SET system_role='user' WHERE id=$1",[id])));
    expect(results.filter(x => x.status==="fulfilled")).toHaveLength(1);
    expect(results.filter(x => x.status==="rejected")[0].reason.code).toBe("23514");
    expect((await pool.query("SELECT count(*)::int n FROM users WHERE system_role='super_admin' AND is_active")).rows[0].n).toBe(1);
    expect((await pool.query("SELECT active_count FROM system_admin_guard")).rows[0].active_count).toBe(1);
  });
});
