const { Pool } = require("pg");
const request = require("supertest");
const sharp = require("sharp");
const { randomUUID } = require("node:crypto");
const { runMigrations } = require("../src/run-migration");
const { after019Applied, rollbackAfter019 } = require("./helpers/migrationVersions");
const { hashPassword } = require("../src/config/password");
const { operationsApp } = require("./helpers/operationsApp");
const { createNotificationWorker } = require("../src/services/notificationWorker");
const { createSiteManagementModel } = require("../src/models/siteManagementModel");
const describePostgres = process.env.SPRINT2_TEST_DATABASE_URL ? describe : describe.skip;

describePostgres("Site management against real PostgreSQL and session authorization", () => {
    const schema=`site_test_${randomUUID().replaceAll("-","")}`;
    const users={},agents={};
    let adminPool,pool,app,store,project,other,parent,leaf,otherLeaf,task,image;
    const url=(suffix,id=project) => `/projects/${id}${suffix}`;
    const migrate=async (command) => { const client=await pool.connect(); try { return await runMigrations({ client,command }); } finally { client.release(); } };
    beforeAll(async () => {
        adminPool=new Pool({ connectionString:process.env.SPRINT2_TEST_DATABASE_URL });
        await adminPool.query(`CREATE SCHEMA "${schema}"`);
        pool=new Pool({ connectionString:process.env.SPRINT2_TEST_DATABASE_URL,options:`-c search_path=${schema}` });
        await migrate("up");
        const password="Site-integration-test-123!",hash=await hashPassword(password);
        for (const role of ["worker","viewer","accountant","admin","engineer","project_manager"]) {
            const roleId=(await pool.query("INSERT INTO roles(name) VALUES($1) RETURNING id",[role])).rows[0].id;
            users[role]=(await pool.query("INSERT INTO users(fullname,email,password_hash,role_id) VALUES($1,$2,$3,$4) RETURNING id",[role,`${role}@site.test`,hash,roleId])).rows[0].id;
        }
        users.outsider=(await pool.query("INSERT INTO users(fullname,email,password_hash,role_id) SELECT 'outsider','outsider@site.test',$1,id FROM roles WHERE name='admin' RETURNING id",[hash])).rows[0].id;
        ({ app,store }=operationsApp(pool));
        for (const role of Object.keys(users)) { agents[role]=request.agent(app); await agents[role].post("/auth/login").send({ email:`${role}@site.test`,password }).expect(200); }
        image=await sharp({ create:{ width:60,height:40,channels:3,background:"#2b78ba" } }).jpeg().toBuffer();
    },30000);
    afterAll(async () => { if (store) await store.close(); if (pool) await pool.end(); if (adminPool) { await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await adminPool.end(); } });
    beforeEach(async () => {
        await pool.query("TRUNCATE projects CASCADE");
        await pool.query("DELETE FROM notification_preferences");
        [project,other]=(await pool.query("INSERT INTO projects(name,location,start_date) VALUES('Công trường thật','Hà Nội','2026-10-01'),('Other','Khác','2026-10-01') RETURNING id")).rows.map((row) => row.id);
        for (const [role,id] of Object.entries(users)) if (role!=="outsider") await pool.query("INSERT INTO project_members(project_id,user_id,role_id) SELECT $1,$2,id FROM roles WHERE name=$3",[project,id,role]);
        await pool.query("INSERT INTO project_members(project_id,user_id,role_id) SELECT $1,$2,id FROM roles WHERE name='admin'",[other,users.outsider]);
        parent=(await pool.query("INSERT INTO work_items(project_id,title) VALUES($1,'Kết cấu') RETURNING id",[project])).rows[0].id;
        leaf=(await pool.query("INSERT INTO work_items(project_id,parent_id,title) VALUES($1,$2,'Móng') RETURNING id",[project,parent])).rows[0].id;
        otherLeaf=(await pool.query("INSERT INTO work_items(project_id,title) VALUES($1,'Other') RETURNING id",[other])).rows[0].id;
        task=(await pool.query("INSERT INTO tasks(work_item_id,name,duration_days) VALUES($1,'Đổ bê tông',3) RETURNING id",[leaf])).rows[0].id;
    });
    const journal=(extra={}) => ({ client_uuid:randomUUID(),work_item_id:leaf,day:"2026-10-05",time:"08:30",content:"Thi công móng",manpower:7,equipment:"Máy đầm",weather:"Nắng",daily_revision:0,photo_ids:[],...extra });
    const contract=() => agents.admin.put(url(`/contracts/${leaf}`)).send({ quantity:"10",unit:"m³",unit_price:"25.50",revision:0 }).expect(200);
    async function makeAcceptance(cumulative="7") { return (await agents.engineer.post(url("/acceptance")).send({ work_item_id:leaf,period:"Đợt 1",day:"2026-10-05",cumulative,notes:"Ghi nhận",photo_ids:[] }).expect(201)).body.form; }
    async function approveAcceptance(form) { const sent=(await agents.engineer.post(url(`/acceptance/${form.id}/transition`)).send({ action:"submit",revision:form.revision }).expect(200)).body.form; return (await agents.viewer.post(url(`/acceptance/${form.id}/transition`)).send({ action:"approve",revision:sent.revision }).expect(200)).body.form; }

    test("every module denies outsiders and restricted roles on the backend", async () => {
        for (const suffix of ["/journals","/acceptance","/payments","/costs","/photos","/reports","/settings","/lookup"]) {
            await request(app).get(url(suffix)).expect(401); await agents.outsider.get(url(suffix)).expect(403);
        }
        for (const suffix of ["/journals","/acceptance","/payments","/costs","/reports"]) await agents.worker.get(url(suffix)).expect(403);
        await agents.viewer.post(url("/journals")).send(journal()).expect(403);
        await agents.engineer.post(url("/payments")).send({}).expect(403);
        await agents.project_manager.post(url("/payments")).send({}).expect(403);
        await agents.viewer.put(url(`/contracts/${leaf}`)).send({}).expect(403);
        await agents.worker.get(url("/photos")).expect(200);
    });

    test("journal CRUD, optimistic revision, idempotent sync, independent failed entries and daily locking", async () => {
        const body=journal();
        const created=(await agents.engineer.post(url("/journals")).send(body).expect(201)).body.journal;
        const duplicate=await agents.engineer.post(url("/journals")).send(body).expect(201);
        expect(duplicate.body.replayed).toBe(true); expect(duplicate.body.journal.id).toBe(created.id);
        await agents.engineer.post(url("/journals")).send({ ...body,content:"Changed payload" }).expect(409);
        await agents.engineer.post(url("/journals")).send(journal({ work_item_id:otherLeaf })).expect(404);
        const edited=(await agents.engineer.put(url(`/journals/${created.id}`)).send({ ...body,content:"Đã cập nhật",revision:1,daily_revision:1 }).expect(200)).body.journal;
        const unchanged=await agents.engineer.put(url(`/journals/${created.id}`)).send({ ...body,revision:1 }).expect(200);
        expect(unchanged.body.merged).toBe(true);
        expect(unchanged.body.journal.content).toBe("Đã cập nhật");
        const sync=await agents.engineer.post(url("/journals/sync")).send({ entries:[journal({ work_item_id:otherLeaf }),journal({ content:"Bản tiếp theo" })] }).expect(200);
        expect(sync.body.results.map((entry) => entry.ok)).toEqual([false,true]);
        await agents.engineer.put(url("/journals/lock")).send({ day:body.day,locked:true }).expect(200);
        await agents.engineer.put(url(`/journals/${created.id}`)).send({ ...body,revision:edited.revision }).expect(403);
        await agents.engineer.post(url("/journals")).send(journal()).expect(403);
        await expect(pool.query("UPDATE site_journals SET content='Direct write' WHERE id=$1",[created.id])).rejects.toMatchObject({ code:"23514" });
        await agents.engineer.put(url("/journals/lock")).send({ day:body.day,locked:false,reason:"Need edit" }).expect(403);
        await agents.admin.put(url("/journals/lock")).send({ day:body.day,locked:false,reason:"" }).expect(400);
        await agents.admin.put(url("/journals/lock")).send({ day:body.day,locked:false,reason:"Bổ sung hồ sơ" }).expect(200);
        await agents.engineer.delete(url(`/journals/${created.id}`)).send({ revision:unchanged.body.journal.revision }).expect(200);
        expect((await agents.engineer.get(url("/journals"))).body.journals).toHaveLength(1);
        const audit=(await agents.admin.get(url("/audit-logs"))).body.entries;
        expect(audit.some((entry) => entry.action==="unlock_day" && entry.after_value.reason==="Bổ sung hồ sơ")).toBe(true);
    });

    test("TTKN-93 [S-24]: Lock daily log -> Attempt update/delete -> Receive 403 Forbidden with exact message", async () => {
        const body = journal({ day: "2026-10-10" });
        const created = (await agents.engineer.post(url("/journals")).send(body).expect(201)).body.journal;

        const lockRes = await agents.engineer.post(url("/journals/lock")).send({ day: "2026-10-10", is_locked: true }).expect(200);
        expect(lockRes.body.lock.is_locked).toBe(true);
        expect(lockRes.body.lock.locked_at).toBeDefined();
        expect(lockRes.body.lock.locked_by).toBeDefined();

        const apiV1LockRes = await agents.engineer.post(`/api/v1${url("/journals/lock")}`).send({ day: "2026-10-10", is_locked: true }).expect(200);
        expect(apiV1LockRes.body.lock.is_locked).toBe(true);

        const putRes = await agents.engineer.put(url(`/journals/${created.id}`)).send({ ...body, content: "Sửa nhật ký đã khóa", revision: created.revision }).expect(403);
        expect(putRes.body.message).toBe("Nhật ký ngày đã bị khóa sổ, không thể chỉnh sửa hoặc xóa.");

        const patchRes = await agents.engineer.patch(url(`/journals/${created.id}`)).send({ ...body, content: "Sửa nhật ký qua patch", revision: created.revision }).expect(403);
        expect(patchRes.body.message).toBe("Nhật ký ngày đã bị khóa sổ, không thể chỉnh sửa hoặc xóa.");

        const deleteRes = await agents.engineer.delete(url(`/journals/${created.id}`)).send({ revision: created.revision }).expect(403);
        expect(deleteRes.body.message).toBe("Nhật ký ngày đã bị khóa sổ, không thể chỉnh sửa hoặc xóa.");
    });

    test("photos validate real image bytes, preserve originals, create thumbnails, scope ownership and link journals", async () => {
        const body={ client_uuid:randomUUID(),work_item_id:leaf,filename:"cong-truong.jpg",data:image.toString("base64") };
        const photo=(await agents.engineer.post(url("/photos")).send(body).expect(201)).body.photo;
        expect(photo.metadata.has_exif).toBe(false);
        expect((await agents.engineer.post(url("/photos")).send(body).expect(201)).body.photo.id).toBe(photo.id);
        await agents.engineer.post(url("/photos")).send({ ...body,client_uuid:randomUUID(),data:Buffer.from("<svg></svg>").toString("base64") }).expect(400);
        await agents.engineer.post(url("/photos")).send({ ...body,client_uuid:randomUUID(),work_item_id:otherLeaf }).expect(404);
        await agents.worker.get(url(`/photos/${photo.id}/original`)).expect(403);
        const original=await agents.engineer.get(url(`/photos/${photo.id}/original`)).expect(200).expect("Content-Type",/image\/jpeg/);
        expect(original.body.equals(image)).toBe(true);
        const thumbnail=await agents.viewer.get(url(`/photos/${photo.id}/thumbnail`)).expect(200);
        expect(thumbnail.body.length).toBeLessThan(1048576);
        await agents.engineer.post(url("/journals")).send(journal({ photo_ids:[photo.id] })).expect(201);
        const gallery=(await agents.viewer.get(url("/photos"))).body.photos;
        expect(gallery[0].journal_ids).toHaveLength(1);
        expect(gallery[0].original).toBeUndefined();
    });

    test("contract leaf and cumulative limits withstand concurrent approval and direct SQL writes", async () => {
        await agents.admin.put(url(`/contracts/${parent}`)).send({ quantity:"10",unit:"m³",unit_price:"1",revision:0 }).expect(422);
        await contract();
        await agents.engineer.post(url("/acceptance")).send({ work_item_id:leaf,period:"Over",day:"2026-10-05",cumulative:"10.0001" }).expect(422);
        // Original S-37 requires creation races to be rejected, before approval.
        const payload={work_item_id:leaf,period:'Concurrent',day:'2026-10-05',cumulative:'7',photo_ids:[]};
        const drafts=await Promise.all([agents.engineer.post(url('/acceptance')).send(payload),agents.admin.post(url('/acceptance')).send(payload)]);
        expect(drafts.map(response=>response.status).sort()).toEqual([201,409]);
        const first=drafts.find(response=>response.status===201).body.form;
        await agents.engineer.post(url(`/acceptance/${first.id}/transition`)).send({ action:"submit",revision:1 }).expect(200);
        const approvals=await Promise.all([1,2].map(() => agents.viewer.post(url(`/acceptance/${first.id}/transition`)).send({ action:"approve",revision:2 })));
        expect(approvals.map((response) => response.status).sort()).toEqual([200,409]);
        expect((await pool.query("SELECT sum(quantity)::text AS total FROM acceptance_forms WHERE status='approved'")).rows[0].total).toBe("7.0000");
        const approved=approvals.find((response) => response.status===200).body.form;
        await agents.engineer.put(url(`/acceptance/${approved.id}`)).send({ work_item_id:leaf,period:"Bad",day:"2026-10-05",cumulative:"9",revision:approved.revision }).expect(409);
        await expect(pool.query("UPDATE acceptance_forms SET notes='Direct edit' WHERE id=$1",[approved.id])).rejects.toMatchObject({ code:"23514" });
        await agents.admin.put(url(`/contracts/${leaf}`)).send({ quantity:"6",unit:"m³",unit_price:"25.50",revision:1 }).expect(422);
        await expect(pool.query("INSERT INTO work_items(project_id,parent_id,title) VALUES($1,$2,'Invalid child')",[project,leaf])).rejects.toMatchObject({ code:"23514" });
        const remaining=await makeAcceptance("10"); expect(remaining.previous_cumulative).toBe("7.0000"); expect(remaining.quantity).toBe("3.0000");
        await approveAcceptance(remaining);
    });

    test("payments calculate exact totals/retention, serialize acceptance reuse, and freeze approved lines", async () => {
        await contract(); const approved=await approveAcceptance(await makeAcceptance());
        const body={ period:"Thanh toán 1",day:"2026-10-05",retention_rate:"10",acceptance_ids:[approved.id] };
        const responses=await Promise.all([agents.accountant.post(url("/payments")).send(body),agents.admin.post(url("/payments")).send(body)]);
        expect(responses.map((response) => response.status).sort()).toEqual([201,409]);
        const payment=responses.find((response) => response.status===201).body.request;
        expect(payment).toMatchObject({ gross:"178.50",retained:"17.85",net:"160.65" });
        const sent=(await agents.accountant.post(url(`/payments/${payment.id}/transition`)).send({ action:"submit",revision:payment.revision }).expect(200)).body.request;
        await agents.viewer.post(url(`/payments/${payment.id}/transition`)).send({ action:"return",revision:sent.revision,reason:" " }).expect(400);
        const returned=(await agents.viewer.post(url(`/payments/${payment.id}/transition`)).send({ action:"return",revision:sent.revision,reason:"Bổ sung chứng từ" }).expect(200)).body.request;
        const revised=(await agents.accountant.put(url(`/payments/${payment.id}`)).send({ ...body,revision:returned.revision }).expect(200)).body.request;
        const resubmitted=(await agents.accountant.post(url(`/payments/${payment.id}/transition`)).send({ action:"submit",revision:revised.revision }).expect(200)).body.request;
        const final=(await agents.viewer.post(url(`/payments/${payment.id}/transition`)).send({ action:"approve",revision:resubmitted.revision }).expect(200)).body.request;
        await agents.accountant.put(url(`/payments/${payment.id}`)).send({ ...body,revision:final.revision }).expect(409);
        await expect(pool.query("UPDATE payment_items SET amount=1 WHERE payment_id=$1",[payment.id])).rejects.toMatchObject({ code:"23514" });
        await expect(pool.query("DELETE FROM payment_requests WHERE id=$1",[payment.id])).rejects.toMatchObject({ code:"23514" });
        expect((await agents.viewer.get(url("/payments"))).body.requests[0].items[0].amount).toBe("178.50");
    });

    test("budgets keep history and aggregate parents; CSV is atomic/idempotent; unallocated costs can be mapped", async () => {
        await contract();
        await agents.accountant.post(url("/budgets")).send({ work_item_id:parent,amount:"100",version:0 }).expect(422);
        await agents.accountant.post(url("/budgets")).send({ work_item_id:leaf,amount:"100",version:0 }).expect(201);
        const cost=(await agents.accountant.post(url("/costs")).send({ day:"2026-10-05",work_item_id:null,amount:"90",type:"Vật tư",client_uuid:randomUUID() }).expect(201)).body.cost;
        await agents.accountant.patch(url(`/costs/${cost.id}/allocate`)).send({ work_item_id:leaf,revision:1 }).expect(200);
        let data=(await agents.accountant.get(url("/costs")).expect(200)).body;
        expect(data.comparison.find((row) => row.id===leaf)).toMatchObject({ budget:"100.00",actual:"90.00",warning:true });
        expect(data.comparison.find((row) => row.id===parent).budget).toBe("100.00");
        await agents.accountant.post(url("/budgets")).send({ work_item_id:leaf,amount:"120",version:1 }).expect(201);
        await agents.accountant.post(url("/budgets")).send({ work_item_id:leaf,amount:"130",version:1 }).expect(409);
        const csv={ client_uuid:randomUUID(),csv:`day,amount,type,work_item_id,notes\n2026-10-05,1.25,Other,,"Có dấu phẩy, ghi chú"\n2026-10-06,2.50,Other,${leaf},OK` };
        await agents.accountant.post(url("/costs/import")).send(csv).expect(200);
        await agents.accountant.post(url("/costs/import")).send(csv).expect(200);
        await agents.accountant.post(url("/costs/import")).send({ client_uuid:randomUUID(),csv:`day,amount,type,work_item_id,notes\n2026-10-05,5,Other,,OK\nBAD,8,Other,,Bad date` }).expect(400);
        data=(await agents.accountant.get(url("/costs"))).body;
        expect(data.costs).toHaveLength(3); expect(data.budgets).toHaveLength(2);
        await expect(pool.query("DELETE FROM budget_versions")).rejects.toMatchObject({ code:"23514" });
    });

    test("concurrent inventory exports never create negative stock, retry is idempotent, norms reconcile", async () => {
        const material=(await agents.accountant.post(url("/materials")).send({ name:"Thép",unit:"kg" }).expect(201)).body.material;
        const incoming={ material_id:material.id,work_item_id:null,direction:"in",quantity:"10",day:"2026-10-05",client_uuid:randomUUID() };
        await agents.accountant.post(url("/inventory")).send(incoming).expect(201); await agents.accountant.post(url("/inventory")).send(incoming).expect(201);
        const outgoing={ ...incoming,direction:"out",work_item_id:leaf,quantity:"7" };
        const results=await Promise.all([1,2].map(() => agents.accountant.post(url("/inventory")).send({ ...outgoing,client_uuid:randomUUID() })));
        expect(results.map((response) => response.status).sort()).toEqual([201,422]);
        await expect(pool.query("INSERT INTO inventory_transactions(project_id,material_id,work_item_id,direction,quantity,day,client_uuid,created_by) VALUES($1,$2,$3,'out',4,'2026-10-05',$4,$5)",[project,material.id,leaf,randomUUID(),users.accountant])).rejects.toMatchObject({ code:"23514" });
        await agents.accountant.put(url("/material-norms")).send({ work_item_id:leaf,material_id:material.id,quantity_per_unit:"2" }).expect(200);
        const data=(await agents.accountant.get(url("/costs"))).body;
        expect(data.materials[0].stock).toBe("3.0000"); expect(data.inventory).toHaveLength(2);
        expect(data.reconciliation[0]).toMatchObject({ issued:"7.0000",quantity_per_unit:"2.0000" });
        expect(Number(data.reconciliation[0].variance)).toBe(7);
    });

    test("settings persist self profile and preferences; milestone events/email delivery are deduplicated and contain no amounts", async () => {
        await agents.worker.patch(url("/account")).send({ fullname:"Tên mới",role:"admin" }).expect(200);
        expect((await agents.worker.get("/auth/me")).body.user.role).toBe("worker");
        await agents.admin.put(url("/settings")).send({ latitude:21,longitude:105.8,radius_m:500,revision:0 }).expect(200);
        await agents.admin.put(url("/settings")).send({ latitude:22,longitude:105.8,radius_m:500,revision:0 }).expect(409);
        await agents.viewer.put(url("/preferences")).send({ type:"milestone_overdue",email_enabled:false }).expect(200);
        await agents.project_manager.post(url("/milestones")).send({ title:"Mốc móng",task_id:task,due_date:"2020-01-01" }).expect(201);
        const messages=[];
        const worker=createNotificationWorker({ pool,from:"test@site.test",appUrl:"https://app.example.test",transport:{ sendMail:async (message) => { messages.push(message); } } });
        await worker.tick(); await worker.tick();
        expect(messages).toHaveLength(2); // admin + project_manager; viewer opted out
        expect(messages.every((message) => message.text.includes("https://app.example.test/reports?projectId=") && !message.text.includes("25.50"))).toBe(true);
        expect((await pool.query("SELECT count(*)::int AS count FROM notifications WHERE type='milestone_overdue'")).rows[0].count).toBe(3);
        expect((await pool.query("SELECT count(*)::int AS count FROM email_outbox WHERE skipped_at IS NOT NULL")).rows[0].count).toBe(1);
        await agents.worker.get(url("/reports/acceptance.pdf")+`?workItemId=${leaf}`).expect(403);
    });

    test("PDF export returns a real document containing the approved dossier and photo, with project access enforced", async () => {
        await contract();
        const photo=(await agents.engineer.post(url("/photos")).send({ client_uuid:randomUUID(),work_item_id:leaf,filename:"nghiem-thu.jpg",data:image.toString("base64") }).expect(201)).body.photo;
        const form=(await agents.engineer.post(url("/acceptance")).send({ work_item_id:leaf,period:"Đợt có ảnh",day:"2026-10-05",cumulative:"7",photo_ids:[photo.id] }).expect(201)).body.form;
        await approveAcceptance(form);
        const response=await agents.viewer.get(url("/reports/acceptance.pdf")+`?workItemId=${leaf}`).buffer(true).parse((res,callback) => { const chunks=[]; res.on("data",(chunk) => chunks.push(chunk)); res.on("end",() => callback(null,Buffer.concat(chunks))); }).expect(200).expect("Content-Type",/application\/pdf/);
        expect(response.body.subarray(0,5).toString()).toBe("%PDF-"); expect(response.body.length).toBeGreaterThan(10000);
        // An ignored QA artifact, never application data or a committed fixture.
        require("node:fs").writeFileSync(require("node:path").join(__dirname,"../node_modules/.site-report-qa.pdf"),response.body);
        await agents.viewer.get(url("/reports/acceptance.pdf")+`?workItemId=${otherLeaf}`).expect(404);
    });

    test("013 rollback refuses data, then roundtrips safely on an unused schema", async () => {
        const model=createSiteManagementModel(pool);
        await model.transaction(project,async (t) => t.saveSettings(project,{ latitude:21,longitude:105,radius_m:50 }));
        await rollbackAfter019(migrate);
        expect((await migrate("down"))[0]).toContain("019_reconcile_journal_lock_guards.sql");
        expect((await migrate("down"))[0]).toContain("018_system_administration.sql");
        expect((await migrate("down"))[0]).toContain("017_sprint4_5.sql");
        expect((await migrate("down"))[0]).toContain("017_add_lock_fields_to_daily_logs.sql");
        expect((await migrate("down"))[0]).toContain("016_create_baselines_and_milestones.sql");
        expect((await migrate("down"))[0]).toContain("015_add_task_actuals.sql");
        expect((await migrate("down"))[0]).toContain("014_create_project_invitations.sql");
        await expect(migrate("down")).rejects.toThrow(/operational data/);
        await pool.query("TRUNCATE projects CASCADE"); await pool.query("DELETE FROM notification_preferences");
        expect((await migrate("down"))[0]).toContain("013_create_site_management.sql");
        expect(await migrate("up")).toEqual(["Applied: 013_create_site_management.sql", "Applied: 014_create_project_invitations.sql", "Applied: 015_add_task_actuals.sql", "Applied: 016_create_baselines_and_milestones.sql", "Applied: 017_add_lock_fields_to_daily_logs.sql", "Applied: 017_sprint4_5.sql", "Applied: 018_system_administration.sql", "Applied: 019_reconcile_journal_lock_guards.sql", ...after019Applied]);
    });
});
