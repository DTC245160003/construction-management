const { Pool }=require("pg");
const request=require("supertest");
const sharp=require("sharp");
const { randomUUID,createHash }=require("node:crypto");
const { runMigrations }=require("../src/run-migration");
const { after019Applied,rollbackAfter019 }=require("./helpers/migrationVersions");
const { hashPassword }=require("../src/config/password");
const { operationsApp }=require("./helpers/operationsApp");
const describeDb=process.env.SPRINT2_TEST_DATABASE_URL ? describe : describe.skip;
describeDb("Sprint 4–5: real PostgreSQL concurrency, versions, photo manifests and authorization",() => {
  const schema=`sprint45_${randomUUID().replaceAll("-","")}`,agents={},users={};
  let admin,pool,app,store,pid,item,otherItem,image;
  const url=(p) => `/projects/${pid}${p}`;
  const migrate=async (command) => { const c=await pool.connect(); try { return await runMigrations({ client:c,command }); } finally { c.release(); } };
  beforeAll(async () => {
    admin=new Pool({ connectionString:process.env.SPRINT2_TEST_DATABASE_URL }); await admin.query(`CREATE SCHEMA "${schema}"`);
    pool=new Pool({ connectionString:process.env.SPRINT2_TEST_DATABASE_URL,options:`-c search_path=${schema}` }); await migrate("up");
    const password="Sprint45-test-only-123!",hash=await hashPassword(password);
    for (const name of ["admin","manager","engineer","engineer2","worker","viewer","outsider"]) {
      const role=name==="engineer2" ? "engineer" : name==="outsider" ? "admin" : name;
      const r=(await pool.query("INSERT INTO roles(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id",[role])).rows[0];
      users[name]=(await pool.query("INSERT INTO users(fullname,email,password_hash,role_id) VALUES($1,$2,$3,$4) RETURNING id",[name,`${name}@s45.test`,hash,r.id])).rows[0].id;
    }
    ({ app,store }=operationsApp(pool));
    for (const name of Object.keys(users)) { agents[name]=request.agent(app); await agents[name].post("/auth/login").send({ email:`${name}@s45.test`,password }).expect(200); }
    image=await sharp({ create:{ width:100,height:100,channels:3,background:"#2489ce" } }).jpeg().toBuffer();
  },30000);
  afterAll(async () => { if (store) await store.close(); if (pool) await pool.end(); if (admin) { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end(); } });
  beforeEach(async () => {
    await pool.query("TRUNCATE projects CASCADE");
    const p=(await pool.query("INSERT INTO projects(name,location,start_date) VALUES('Sprint45','Test','2026-10-01'),('Other','Test','2026-10-01') RETURNING id")).rows;
    pid=p[0].id;
    await pool.query("INSERT INTO project_members(project_id,user_id,role_id) SELECT $1,id,role_id FROM users WHERE email<>'outsider@s45.test'",[pid]);
    await pool.query("INSERT INTO project_members(project_id,user_id,role_id) SELECT $1,id,role_id FROM users WHERE email='outsider@s45.test'",[p[1].id]);
    item=(await pool.query("INSERT INTO work_items(project_id,title) VALUES($1,'Móng') RETURNING id",[pid])).rows[0].id;
    otherItem=(await pool.query("INSERT INTO work_items(project_id,title) VALUES($1,'Khác') RETURNING id",[p[1].id])).rows[0].id;
  });
  const body=(extra={}) => ({ client_uuid:randomUUID(),operation_uuid:randomUUID(),work_item_id:item,day:"2026-10-05",time:"08:30",content:"Thi công móng",manpower:8,weather_code:"sunny",equipment_codes:["compactor"],daily_revision:0,photo_ids:[],...extra });
  const create=async (b=body()) => (await agents.engineer.post(url("/journals")).send(b).expect(201)).body.journal;

  test("concurrent identical sends create one journal and one daily row; a rejected entry does not stop its successor",async () => {
    const b=body(),responses=await Promise.all(Array.from({ length:8 },() => agents.engineer.post(url("/journals")).send(b)));
    expect(responses.map((r) => r.status)).toEqual(Array(8).fill(201)); expect(new Set(responses.map((r) => r.body.journal.id)).size).toBe(1);
    expect((await pool.query("SELECT count(*)::int n FROM site_journals")).rows[0].n).toBe(1);
    expect((await pool.query("SELECT count(*)::int n FROM journal_daily_info")).rows[0].n).toBe(1);
    const result=await agents.engineer.post(url("/journals/sync")).send({ entries:[body({ work_item_id:otherItem }),body({ content:"Sau lỗi" })] }).expect(200);
    expect(result.body.results.map((r) => r.ok)).toEqual([false,true]);
    await agents.outsider.post(url("/journals/sync")).send({ entries:[b] }).expect(403);
    await agents.engineer.post(url("/journals/sync")).send({ expected_user_id:users.engineer2,entries:[b] }).expect(403);
  });
  test("two engineers create a persistent same-field conflict; resolution and both versions remain auditable",async () => {
    const b=body(),j=await create(b);
    const first=await agents.engineer.put(url(`/journals/${j.id}`)).send({ ...b,operation_uuid:randomUUID(),revision:1,content:"Bản A",daily_revision:1 }).expect(200);
    const incoming={ ...b,operation_uuid:randomUUID(),revision:1,content:"Bản B",daily_revision:1 };
    const second=await agents.engineer2.put(url(`/journals/${j.id}`)).send(incoming).expect(409);
    await agents.engineer2.put(url(`/journals/${j.id}`)).send(incoming).expect(409);
    const history=(await agents.engineer.get(url(`/journals/${j.id}/history`)).expect(200)).body;
    expect(history.conflicts).toHaveLength(1); expect(history.journal.content).toBe("Bản A"); expect(history.versions).toHaveLength(2);
    const c=second.body.conflict;
    await agents.viewer.post(url(`/journals/conflicts/${c.id}/resolve`)).send({ chosen:"incoming",revision:2 }).expect(403);
    const resolved=await agents.engineer2.post(url(`/journals/conflicts/${c.id}/resolve`)).send({ chosen:"incoming",revision:first.body.journal.revision }).expect(200);
    expect(resolved.body.journal.content).toBe("Bản B"); expect(resolved.body.journal.revision).toBe(3);
    const after=(await agents.engineer.get(url(`/journals/${j.id}/history`))).body;
    expect(after.versions.map((v) => v.snapshot.content)).toEqual(["Bản B","Bản A","Thi công móng"]);
    expect(after.conflicts[0].server_snapshot.content).toBe("Bản A");
    await expect(pool.query("DELETE FROM journal_versions WHERE journal_id=$1",[j.id])).rejects.toMatchObject({ code:"23514" });
    await expect(pool.query("UPDATE journal_conflicts SET incoming_snapshot='{}'::jsonb WHERE id=$1",[c.id])).rejects.toMatchObject({ code:"23514" });
  });
  test("independent edits merge from the saved base and update replay never writes twice",async () => {
    const b=body(),j=await create(b);
    await agents.engineer.put(url(`/journals/${j.id}`)).send({ ...b,operation_uuid:randomUUID(),revision:1,content:"Đổi nội dung",daily_revision:1 }).expect(200);
    const edit={ ...b,operation_uuid:randomUUID(),revision:1,time:"09:15",daily_revision:1 };
    const result=await agents.engineer2.put(url(`/journals/${j.id}`)).send(edit).expect(200);
    expect(result.body.merged).toBe(true); expect(result.body.journal.content).toBe("Đổi nội dung"); expect(result.body.journal.time.slice(0,5)).toBe("09:15");
    const replay=await agents.engineer2.put(url(`/journals/${j.id}`)).send(edit).expect(200); expect(replay.body.replayed).toBe(true); expect(replay.body.journal.revision).toBe(3);
    expect((await agents.engineer.get(url(`/journals/${j.id}/history`))).body.conflicts).toHaveLength(0);
  });
  test("a stale content edit follows a server date move without overwriting the destination daily header",async () => {
    const b=body(),j=await create(b),destination="2026-10-06";
    const header={ day:destination,manpower:50,weather_code:"rain",equipment_codes:["crane"],revision:0 };
    await agents.engineer.put(url("/journals/daily")).send(header).expect(200);
    await agents.engineer.put(url(`/journals/${j.id}`)).send({ ...b,operation_uuid:randomUUID(),revision:1,day:destination,manpower:50,weather_code:"rain",equipment_codes:["crane"],daily_revision:1 }).expect(200);
    const merged=await agents.engineer2.put(url(`/journals/${j.id}`)).send({ ...b,operation_uuid:randomUUID(),revision:1,content:"Nội dung offline từ ngày cũ",daily_revision:1 }).expect(200);
    expect(merged.body).toMatchObject({ merged:true,journal:{ day:destination,content:"Nội dung offline từ ngày cũ",revision:3 } });
    const daily=(await agents.viewer.get(url(`/journals/daily?day=${destination}`))).body.daily;
    expect(daily).toMatchObject({ manpower:50,weather_code:"rain",equipment_codes:["crane"],revision:1 });
  });
  test("resolution must match the latest reviewed revision; refreshed incoming choice preserves newer server history",async () => {
    const b=body(),j=await create(b);
    await agents.engineer.put(url(`/journals/${j.id}`)).send({ ...b,operation_uuid:randomUUID(),revision:1,content:"A",daily_revision:1 }).expect(200);
    const c=(await agents.engineer2.put(url(`/journals/${j.id}`)).send({ ...b,operation_uuid:randomUUID(),revision:1,content:"B",daily_revision:1 }).expect(409)).body.conflict;
    await agents.engineer.put(url(`/journals/${j.id}`)).send({ ...b,operation_uuid:randomUUID(),revision:2,content:"A",time:"09:15",daily_revision:1 }).expect(200);
    await agents.engineer2.post(url(`/journals/conflicts/${c.id}/resolve`)).send({ chosen:"incoming",revision:2 }).expect(409);
    const latest=(await agents.engineer2.get(url(`/journals/${j.id}/history`))).body; expect(latest.journal.revision).toBe(3);
    const result=await agents.engineer2.post(url(`/journals/conflicts/${c.id}/resolve`)).send({ chosen:"incoming",revision:latest.journal.revision }).expect(200);
    expect(result.body.journal).toMatchObject({ content:"B",revision:4 });
    expect((await agents.engineer2.get(url(`/journals/${j.id}/history`))).body.versions).toHaveLength(4);
  });
  test("configured daily header is unique concurrently; all-day rain and equipment come from project data",async () => {
    await agents.manager.put(url("/journals/catalog")).send({ kind:"weather",code:"storm",label:"Bão cả ngày",all_day_rain:true,active:true }).expect(200);
    const d={ day:"2026-10-04",manpower:12,weather_code:"storm",equipment_codes:["crane"],revision:0 };
    const results=await Promise.all([agents.engineer.put(url("/journals/daily")).send(d),agents.engineer2.put(url("/journals/daily")).send(d)]);
    expect(results.map((r) => r.status).sort()).toEqual([200,409]);
    const range=(await agents.viewer.get(url("/journals/days?from=2026-10-01&to=2026-10-07")).expect(200)).body;
    expect(range.days).toHaveLength(1); expect(range.days[0]).toMatchObject({ all_day_rain:true,weather:"Bão cả ngày",equipment:"Cẩu" });
    await agents.engineer.put(url("/journals/daily")).send({ ...d,revision:1,weather_code:"made_up" }).expect(400);
    await agents.worker.put(url("/journals/catalog")).send({}).expect(403);
  });
  test("10 private photos have pending placeholders, valid originals, small thumbnails, checksum guards and safe concurrent replay",async () => {
    const pending=Array.from({ length:10 },(_,i) => ({ client_uuid:randomUUID(),filename:`site-${i}.jpg` })),j=await create(body({ pending_photos:pending }));
    const before=(await agents.viewer.get(url("/journals"))).body.journals[0]; expect(before.photo_uploads.filter((p) => !p.photo_id)).toHaveLength(10);
    const checksum=createHash("sha256").update(image).digest("hex");
    for (const p of pending) {
      const upload={ ...p,journal_id:j.id,work_item_id:item,data:image.toString("base64"),display_data:image.toString("base64"),checksum };
      const responses=await Promise.all([agents.engineer.post(url("/photos")).send(upload),agents.engineer.post(url("/photos")).send(upload)]);
      expect(responses.map((r) => r.status)).toEqual([201,201]); expect(responses[0].body.photo.id).toBe(responses[1].body.photo.id);
      const photo=responses[0].body.photo;
      const original=await agents.engineer.get(url(`/photos/${photo.id}/original`)).expect(200); expect(original.body.equals(image)).toBe(true);
      const thumb=await agents.engineer.get(url(`/photos/${photo.id}/thumbnail`)).expect(200); expect(thumb.body.length).toBeLessThan(1048576);
      await agents.outsider.get(url(`/photos/${photo.id}/original`)).expect(403);
      expect(photo.latitude).toBeNull(); expect(photo.taken_at).toBeNull();
    }
    expect((await pool.query("SELECT count(*)::int n FROM site_photos")).rows[0].n).toBe(10);
    const after=(await agents.viewer.get(url("/journals"))).body.journals[0]; expect(after.photo_ids).toHaveLength(10); expect(after.photo_uploads.every((p) => p.photo_id)).toBe(true);
    await agents.engineer.post(url("/photos")).send({ client_uuid:randomUUID(),filename:"bad.jpg",work_item_id:item,data:image.toString("base64"),checksum:"0".repeat(64) }).expect(400);
  });
  test("locks reject uploads, SQL photo links, sync, deletes and conflict resolution; only admin unlocks with an audited reason",async () => {
    const pending={ client_uuid:randomUUID(),filename:"pending.jpg" },b=body({ pending_photos:[pending] }),j=await create(b);
    await agents.engineer.put(url(`/journals/${j.id}`)).send({ ...b,operation_uuid:randomUUID(),revision:1,content:"A",daily_revision:1 }).expect(200);
    const conflict=(await agents.engineer2.put(url(`/journals/${j.id}`)).send({ ...b,operation_uuid:randomUUID(),revision:1,content:"B",pending_photos:[],daily_revision:1 }).expect(409)).body.conflict;
    await agents.engineer.put(url("/journals/lock")).send({ day:b.day,locked:true }).expect(200);
    await agents.engineer.post(url("/photos")).send({ ...pending,journal_id:j.id,work_item_id:item,data:image.toString("base64") }).expect(403);
    await agents.engineer.delete(url(`/journals/${j.id}`)).send({ revision:2 }).expect(403);
    const sync=(await agents.engineer.post(url("/journals/sync")).send({ entries:[body()] }).expect(200)).body; expect(sync.results[0].status).toBe(403);
    await agents.engineer.post(url(`/journals/conflicts/${conflict.id}/resolve`)).send({ chosen:"incoming",revision:2 }).expect(403);
    await expect(pool.query("INSERT INTO journal_photo_uploads(client_uuid,journal_id,uploaded_by,filename) VALUES($1,$2,$3,'x.jpg')",[randomUUID(),j.id,users.engineer])).rejects.toMatchObject({ code:"23514" });
    await agents.engineer.put(url("/journals/lock")).send({ day:b.day,locked:false,reason:"Bổ sung" }).expect(403);
    await agents.manager.put(url("/journals/lock")).send({ day:b.day,locked:false,reason:"Bổ sung hồ sơ" }).expect(403);
    await agents.admin.put(url("/journals/lock")).send({ day:b.day,locked:false,reason:"" }).expect(400);
    await agents.admin.put(url("/journals/lock")).send({ day:b.day,locked:false,reason:"Bổ sung hồ sơ" }).expect(200);
    const audit=(await pool.query("SELECT * FROM audit_logs WHERE action='unlock_day'")).rows[0]; expect(audit.actor_id).toBe(users.admin); expect(audit.after_value.reason).toBe("Bổ sung hồ sơ");
  });
  test("record locks protect dates, shared daily data, photo manifests and conflicts while accepted offline retries remain idempotent",async () => {
    const pending={ client_uuid:randomUUID(),filename:"record-pending.jpg" },b=body({ pending_photos:[pending] }),j=await create(b);
    const sibling=await create(body({ content:"Nhật ký khác cùng ngày" }));
    const edit={ ...b,operation_uuid:randomUUID(),revision:1,content:"A",daily_revision:1 };
    await agents.engineer.put(url(`/journals/${j.id}`)).send(edit).expect(200);
    const conflict=(await agents.engineer2.put(url(`/journals/${j.id}`)).send({ ...b,operation_uuid:randomUUID(),revision:1,content:"B",pending_photos:[],daily_revision:1 }).expect(409)).body.conflict;
    const lock=(await agents.engineer.post(url(`/journals/${j.id}/lock`)).send({ is_locked:true }).expect(200)).body.lock;
    expect(lock).toMatchObject({ is_locked:true,locked:true,locked_by:users.engineer });
    expect((await pool.query("SELECT * FROM journal_day_locks WHERE project_id=$1 AND day=$2",[pid,b.day])).rows).toHaveLength(0);
    const listed=(await agents.viewer.get(url("/journals"))).body.journals;
    expect(listed.find((entry) => entry.id===j.id)).toMatchObject({ locked:true,is_locked:true,day_locked:false });
    expect(listed.find((entry) => entry.id===sibling.id)).toMatchObject({ locked:false,is_locked:false,day_locked:false });
    expect((await agents.viewer.get(url(`/journals/daily?day=${b.day}`))).body.daily.is_locked).toBe(true);
    await agents.engineer.patch(url(`/journals/${j.id}`)).send({ ...edit,operation_uuid:randomUUID(),revision:2,day:"2026-10-06" }).expect(403);
    await agents.engineer.delete(url(`/journals/${j.id}`)).send({ revision:2 }).expect(403);
    await agents.engineer.post(url(`/journals/conflicts/${conflict.id}/resolve`)).send({ chosen:"server",revision:2 }).expect(403);
    await agents.engineer.post(url("/photos")).send({ ...pending,journal_id:j.id,work_item_id:item,data:image.toString("base64") }).expect(403);
    await agents.engineer.put(url("/journals/daily")).send({ day:b.day,manpower:99,weather_code:"sunny",equipment_codes:["compactor"],revision:1 }).expect(403);
    await agents.engineer.put(url(`/journals/${sibling.id}`)).send({ ...body(),revision:1,daily_revision:1,manpower:99 }).expect(403);
    await agents.engineer.put(url(`/journals/${sibling.id}`)).send({ ...body(),revision:1,daily_revision:1,content:"Nội dung khác, giữ thông tin ngày" }).expect(200);
    const replay=await agents.engineer.put(url(`/journals/${j.id}`)).send(edit).expect(200); expect(replay.body.replayed).toBe(true); expect(replay.body.journal.revision).toBe(2);
    const sync=(await agents.engineer.post(url("/journals/sync")).send({ entries:[{ ...edit,id:j.id },{ ...edit,id:j.id,operation_uuid:randomUUID(),revision:2,content:"Queued edit after lock" }] }).expect(200)).body.results;
    expect(sync.map((entry) => entry.ok)).toEqual([true,false]); expect(sync[1].status).toBe(403);
    expect((await pool.query("SELECT count(*)::int n FROM journal_versions WHERE journal_id=$1",[j.id])).rows[0].n).toBe(2);
    await expect(pool.query("UPDATE site_journals SET content='Bypass' WHERE id=$1",[j.id])).rejects.toMatchObject({ code:"23514" });
    await expect(pool.query("UPDATE journal_daily_info SET manpower=99 WHERE project_id=$1 AND day=$2",[pid,b.day])).rejects.toMatchObject({ code:"23514" });
    await expect(pool.query("INSERT INTO journal_photo_uploads(client_uuid,journal_id,uploaded_by,filename) VALUES($1,$2,$3,'bypass.jpg')",[randomUUID(),j.id,users.engineer])).rejects.toMatchObject({ code:"23514" });
    await agents.manager.post(url(`/journals/${j.id}/lock`)).send({ locked:false,reason:"Bổ sung" }).expect(403);
    await agents.admin.post(url(`/journals/${j.id}/lock`)).send({ locked:false,reason:"Bổ sung" }).expect(200);
    expect((await agents.viewer.get(url(`/journals/daily?day=${b.day}`))).body.daily.is_locked).toBe(false);
    const audit=(await pool.query("SELECT * FROM audit_logs WHERE action='unlock_record'")).rows[0]; expect(audit.after_value.reason).toBe("Bổ sung");
  });
  test("project serialization makes locking atomic with concurrent journal writes",async () => {
    const b=body(),j=await create(b),update={ ...b,operation_uuid:randomUUID(),revision:1,content:"Concurrent update",daily_revision:1 };
    const [locked,write]=await Promise.all([
      agents.engineer.post(url("/journals/lock")).send({ day:b.day,is_locked:true }),
      agents.engineer.put(url(`/journals/${j.id}`)).send(update)
    ]);
    expect(locked.status).toBe(200); expect([200,403]).toContain(write.status);
    const row=(await pool.query("SELECT * FROM site_journals WHERE id=$1",[j.id])).rows[0]; expect(row.is_locked).toBe(true);
    expect(row.content).toBe(write.status===200 ? "Concurrent update" : b.content);
    await agents.engineer.put(url(`/journals/${j.id}`)).send({ ...update,operation_uuid:randomUUID(),revision:row.revision }).expect(403);
  });
  test("SQL cannot move photos or manifests away from a record lock, and rollback preserves lock metadata",async () => {
    const photo=(await agents.engineer.post(url("/photos")).send({ client_uuid:randomUUID(),work_item_id:item,filename:"linked.jpg",data:image.toString("base64") }).expect(201)).body.photo;
    const pending={ client_uuid:randomUUID(),filename:"not-yet-uploaded.jpg" };
    const j=await create(body({ photo_ids:[photo.id],pending_photos:[pending] })),sibling=await create(body());
    await agents.engineer.post(url(`/journals/${j.id}/lock`)).send({ is_locked:true }).expect(200);
    await expect(pool.query("UPDATE journal_photos SET journal_id=$2 WHERE journal_id=$1",[j.id,sibling.id])).rejects.toMatchObject({ code:"23514" });
    await expect(pool.query("DELETE FROM journal_photos WHERE journal_id=$1",[j.id])).rejects.toMatchObject({ code:"23514" });
    await expect(pool.query("UPDATE journal_photo_uploads SET journal_id=$2 WHERE journal_id=$1",[j.id,sibling.id])).rejects.toMatchObject({ code:"23514" });
    await expect(pool.query("DELETE FROM journal_photo_uploads WHERE journal_id=$1",[j.id])).rejects.toMatchObject({ code:"23514" });
    await rollbackAfter019(migrate);
    await expect(migrate("down")).rejects.toThrow(/preserve lock metadata/);
    expect(await migrate('up')).toEqual(after019Applied);
    expect((await pool.query("SELECT photo_id FROM journal_photos WHERE journal_id=$1",[j.id])).rows).toEqual([{ photo_id:photo.id }]);
    expect((await agents.viewer.get(url(`/journals/${j.id}/history`))).body.journal.is_locked).toBe(true);
  });
  test("accepted photo retries after locking preserve their binding without new writes",async () => {
    const accepted={ client_uuid:randomUUID(),filename:"accepted.jpg" },pending={ client_uuid:randomUUID(),filename:"pending.jpg" };
    const j=await create(body({ pending_photos:[accepted,pending] }));
    const upload={ ...accepted,journal_id:j.id,work_item_id:item,data:image.toString("base64") };
    const photo=(await agents.engineer.post(url("/photos")).send(upload).expect(201)).body.photo;
    await agents.engineer.post(url(`/journals/${j.id}/lock`)).send({ is_locked:true }).expect(200);
    const replay=await agents.engineer.post(url("/photos")).send(upload).expect(201); expect(replay.body.photo.id).toBe(photo.id);
    await agents.engineer.post(url("/photos")).send({ ...upload,...pending }).expect(403);
    const altered=await sharp({ create:{ width:100,height:100,channels:3,background:"#ff0000" } }).jpeg().toBuffer();
    await agents.engineer.post(url("/photos")).send({ ...upload,data:altered.toString("base64") }).expect(409);
    expect((await pool.query("SELECT count(*)::int n FROM site_photos")).rows[0].n).toBe(1);
    expect((await pool.query("SELECT count(*)::int n FROM journal_versions WHERE journal_id=$1",[j.id])).rows[0].n).toBe(2);
    expect((await agents.viewer.get(url(`/journals/${j.id}/history`))).body.journal.revision).toBe(2);
  });
  test("repeated day locks remain stable and day unlock preserves an earlier individual record lock",async () => {
    const b=body(),individual=await create(b),other=await create(body());
    const individualLock=(await agents.engineer.post(url(`/journals/${individual.id}/lock`)).send({ locked:true }).expect(200)).body.lock;
    const first=(await agents.engineer.post(url("/journals/lock")).send({ day:b.day,locked:true }).expect(200)).body.lock;
    const repeated=(await agents.manager.post(url("/journals/lock")).send({ day:b.day,is_locked:true }).expect(200)).body.lock;
    expect(repeated.locked_at).toBe(first.locked_at); expect(repeated.locked_by).toBe(first.locked_by);
    await agents.admin.post(url("/journals/lock")).send({ day:b.day,is_locked:false,reason:"Mở ngày, giữ khóa riêng" }).expect(200);
    const journals=(await agents.viewer.get(url("/journals"))).body.journals;
    expect(journals.find((entry) => entry.id===individual.id)).toMatchObject({ locked:true,day_locked:false,locked_at:individualLock.locked_at });
    expect(journals.find((entry) => entry.id===other.id)).toMatchObject({ locked:false,is_locked:false,locked_at:null,locked_by:null });
    await agents.admin.post(url(`/journals/${individual.id}/lock`)).send({ locked:false,reason:"Bổ sung" }).expect(200);
    expect((await agents.viewer.get(url(`/journals/daily?day=${b.day}`))).body.daily.is_locked).toBe(false);
  });
  test("conflict resolution cannot move an unlocked journal into a locked destination day",async () => {
    const b=body(),j=await create(b),destination="2026-10-06";
    await agents.engineer.put(url(`/journals/${j.id}`)).send({ ...b,operation_uuid:randomUUID(),revision:1,content:"A",daily_revision:1 }).expect(200);
    const conflict=(await agents.engineer2.put(url(`/journals/${j.id}`)).send({ ...b,operation_uuid:randomUUID(),revision:1,content:"B",day:destination,daily_revision:0 }).expect(409)).body.conflict;
    await agents.engineer.post(url("/journals/lock")).send({ day:destination,is_locked:true }).expect(200);
    await agents.engineer2.post(url(`/journals/conflicts/${conflict.id}/resolve`)).send({ chosen:"incoming",revision:2 }).expect(403);
    expect((await agents.viewer.get(url(`/journals/${j.id}/history`))).body.journal).toMatchObject({ day:b.day,content:"A",revision:2 });
  });
  test("original camera EXIF timestamp and GPS are extracted from bytes and preserved without inventing missing metadata",async () => {
    const original=await sharp({ create:{ width:120,height:100,channels:3,background:"#2489ce" } }).withExif({ IFD0:{ Make:"Test camera" },IFD2:{ DateTimeOriginal:"2026:10:05 08:30:00" },IFD3:{ GPSLatitudeRef:"N",GPSLatitude:"10/1 46/1 48/1",GPSLongitudeRef:"E",GPSLongitude:"106/1 42/1 0/1" } }).jpeg().toBuffer();
    const photo=(await agents.engineer.post(url("/photos")).send({ client_uuid:randomUUID(),work_item_id:item,filename:"camera-fixture.jpg",data:original.toString("base64"),checksum:createHash("sha256").update(original).digest("hex") }).expect(201)).body.photo;
    expect(photo.latitude).toBeCloseTo(10.78); expect(photo.longitude).toBeCloseTo(106.7); expect(photo.taken_at).not.toBeNull(); expect(photo.metadata).toMatchObject({ has_exif:true,make:"Test camera" });
    expect((await agents.engineer.get(url(`/photos/${photo.id}/original`)).expect(200)).body.equals(original)).toBe(true);
  });
  test("secure invitation cancellation and expiry block registration; plain registration cannot consume pending project roles",async () => {
    const invite=(await agents.admin.post(url("/members")).send({ email:"new@s45.test",role:"worker" }).expect(201)).body;
    const token=new URL(invite.acceptance_path,"http://test").searchParams.get("token");
    await request(app).post("/auth/register").send({ email:"new@s45.test",fullname:"Mới",password:"Test-user-123!",role:"worker" }).expect(201);
    const user=(await pool.query("SELECT id FROM users WHERE email='new@s45.test'")).rows[0];
    expect((await pool.query("SELECT * FROM project_members WHERE user_id=$1",[user.id])).rowCount).toBe(0);
    expect((await pool.query("SELECT token_hash FROM project_invitations WHERE id=$1",[invite.invitation.id])).rows[0].token_hash).not.toBe(token);
    const canceled=(await agents.admin.post(url("/members")).send({ email:"cancel@s45.test",role:"worker" })).body;
    await agents.admin.delete(url(`/invitations/${canceled.invitation.id}`)).expect(204);
    await request(app).post("/auth/register").send({ email:"cancel@s45.test",fullname:"Mới",password:"Test-user-123!",role:"worker",invitation_token:new URL(canceled.acceptance_path,"http://test").searchParams.get("token") }).expect(409);
    const expired=(await agents.admin.post(url("/members")).send({ email:"expired@s45.test",role:"engineer" })).body;
    await pool.query("UPDATE project_invitations SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=$1",[expired.invitation.id]);
    await request(app).post("/auth/register").send({ email:"expired@s45.test",fullname:"Mới",password:"Test-user-123!",role:"worker",invitation_token:new URL(expired.acceptance_path,"http://test").searchParams.get("token") }).expect(409);
  });
  test("017 migration refuses data loss and roundtrips on a separate empty test schema",async () => {
    await create(); await rollbackAfter019(migrate); await migrate("down"); await migrate("down"); await expect(migrate("down")).rejects.toThrow(/preserve business data/); await migrate("up");
    const empty=`empty45_${randomUUID().replaceAll("-","")}`;
    await admin.query(`CREATE SCHEMA "${empty}"`); const isolated=new Pool({ connectionString:process.env.SPRINT2_TEST_DATABASE_URL,options:`-c search_path=${empty}` });
    try { const c=await isolated.connect(); try { await runMigrations({ client:c }); await rollbackAfter019(command => runMigrations({ client:c,command })); await runMigrations({ client:c,command:"down" }); await runMigrations({ client:c,command:"down" }); expect(await runMigrations({ client:c,command:"down" })).toEqual(["Rolled back: 017_sprint4_5.sql"]); expect(await runMigrations({ client:c })).toEqual(["Applied: 017_sprint4_5.sql","Applied: 018_system_administration.sql","Applied: 019_reconcile_journal_lock_guards.sql",...after019Applied]); } finally { c.release(); } }
    finally { await isolated.end(); await admin.query(`DROP SCHEMA "${empty}" CASCADE`); }
  });
});
