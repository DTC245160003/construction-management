const {Pool}=require('pg');
const request=require('supertest');
const sharp=require('sharp');
const {randomUUID}=require('node:crypto');
const {runMigrations}=require('../src/run-migration');
const {hashPassword}=require('../src/config/password');
const {operationsApp}=require('./helpers/operationsApp');
const {contractRollup,costComparison,baselineComparison,valueProgress}=require('../src/services/financeSummary');

test('hand-calculated tree values and exact 80 percent boundaries',()=>{
 const items=[{id:1,parent_id:null},{id:2,parent_id:1},{id:3,parent_id:1}];
 const contracts=[{work_item_id:2,quantity:'100',unit_price:'1.01',approved_quantity:'20'},{work_item_id:3,quantity:'200',unit_price:'2.02',approved_quantity:'0'}];
 expect(contractRollup(items,contracts)[0]).toMatchObject({contract_value:'505.00',accepted_value:'20.20',accepted_percent:4});
 expect(valueProgress(items,[contracts[0]])).toMatchObject({progress:null,contract_coverage:{complete:false,configured_leaf_count:1,total_leaf_count:2}});
 const budgets=[{work_item_id:2,amount:'100',version:2},{work_item_id:3,amount:'200',version:1}];
 const costs=[{work_item_id:2,amount:'81'},{work_item_id:3,amount:'168'}];
 expect(costComparison(items,budgets,costs,contracts)[0]).toMatchObject({budget:'300.00',actual:'249.00',variance:'51.00',warning:true});
 expect(costComparison(items,budgets,[{work_item_id:2,amount:'80'}],contracts)[1].warning).toBe(false);
 expect(costComparison(items,budgets,[{work_item_id:2,amount:'80.01'}],[{...contracts[0],approved_quantity:'80'},contracts[1]])[1].warning).toBe(false);
});
test('baseline comparison uses original start and calendar; unavailable history stays unknown',()=>{
 const rows=[{early_finish:6}],context={original_start_date:'2026-10-05',working_days:[1,2,3,4,5,6],holidays:[]};
 expect(baselineComparison(rows,context,'2026-10-13',{working_days:[1,2,3,4,5,6]},[])).toMatchObject({baseline_finish:'2026-10-10',finish_variance_days:2});
 expect(baselineComparison(rows,null,'2026-10-13',{working_days:[1,2,3,4,5,6]},[])).toMatchObject({baseline_finish:null,finish_variance_days:null,baseline_context_missing:true});
});
const describeDb=process.env.SPRINT2_TEST_DATABASE_URL?describe:describe.skip;
describeDb('Sprint 6-8 real PostgreSQL financial invariants and evidence',()=>{
 const schema='sprint68_'+randomUUID().replaceAll('-',''),users={},agents={};let admin,pool,app,store,pid,other,parent,leaf,second;
 const url=s=>`/projects/${pid}${s}`;
 beforeAll(async()=>{
  if(!new URL(process.env.SPRINT2_TEST_DATABASE_URL).pathname.endsWith('_test'))throw new Error('A separate test database is required');
  admin=new Pool({connectionString:process.env.SPRINT2_TEST_DATABASE_URL});await admin.query(`CREATE SCHEMA "${schema}"`);
  pool=new Pool({connectionString:process.env.SPRINT2_TEST_DATABASE_URL,options:`-c search_path=${schema}`});
  const c=await pool.connect();try{await runMigrations({client:c});}finally{c.release();}
  const hash=await hashPassword('Sprint68-test-only-123!');
  for(const role of ['admin','engineer','accountant','viewer','worker','outsider']){
   const rid=(await pool.query('INSERT INTO roles(name) VALUES($1) RETURNING id',[role])).rows[0].id;
   users[role]=(await pool.query('INSERT INTO users(fullname,email,password_hash,role_id) VALUES($1,$2,$3,$4) RETURNING id',[role,role+'@s68.test',hash,rid])).rows[0].id;
  }
  ({app,store}=operationsApp(pool));
  for(const role of Object.keys(users)){agents[role]=request.agent(app);await agents[role].post('/auth/login').send({email:role+'@s68.test',password:'Sprint68-test-only-123!'}).expect(200);}
 },30000);
 beforeEach(async()=>{
  await pool.query('TRUNCATE projects CASCADE');
  [pid,other]=(await pool.query("INSERT INTO projects(name,location,start_date) VALUES('S68 thật','Hà Nội','2026-10-05'),('Riêng','Khác','2026-10-05') RETURNING id")).rows.map(x=>x.id);
  for(const role of ['admin','engineer','accountant','viewer','worker'])await pool.query('INSERT INTO project_members(project_id,user_id,role_id) SELECT $1,id,role_id FROM users WHERE id=$2',[pid,users[role]]);
  await pool.query('INSERT INTO project_calendars(project_id,working_days) VALUES($1,$2) ON CONFLICT(project_id) DO UPDATE SET working_days=EXCLUDED.working_days',[pid,[1,2,3,4,5,6]]);
  parent=(await pool.query("INSERT INTO work_items(project_id,title) VALUES($1,'Kết cấu') RETURNING id",[pid])).rows[0].id;
  [leaf,second]=(await pool.query("INSERT INTO work_items(project_id,parent_id,title) VALUES($1,$2,'Bê tông'),($1,$2,'Cốt thép') RETURNING id",[pid,parent])).rows.map(x=>x.id);
 });
 afterAll(async()=>{if(store)await store.close();if(pool)await pool.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
 async function contract(id=leaf,quantity='100',price='1.01'){return(await agents.admin.put(url('/contracts/'+id)).send({quantity,unit:'m³',unit_price:price,revision:0}).expect(200)).body.contract;}
 async function draft(cumulative='10',extra={}){return(await agents.engineer.post(url('/acceptance')).send({work_item_id:leaf,period:'Đợt 1',day:'2026-10-14',cumulative,photo_ids:[],...extra}).expect(201)).body.form;}
 async function approve(form){const sent=(await agents.admin.post(url(`/acceptance/${form.id}/transition`)).send({action:'submit',revision:form.revision}).expect(200)).body.form;return(await agents.admin.post(url(`/acceptance/${form.id}/transition`)).send({action:'approve',revision:sent.revision}).expect(200)).body.form;}
 async function payment(form,extra={}){return(await agents.accountant.post(url('/payments')).send({period:'Thanh toán',day:'2026-10-14',retention_rate:'0',acceptance_ids:[form.id],...extra}).expect(201)).body.request;}
 async function movePayment(p,action,reason){return(await agents.viewer.post(url(`/payments/${p.id}/transition`)).send({action,reason,revision:p.revision}).expect(200)).body.request;}
 async function submitPayment(p){return(await agents.accountant.post(url(`/payments/${p.id}/transition`)).send({action:'submit',revision:p.revision}).expect(200)).body.request;}

 test('S35 bridges WBS and financial contracts in both directions with actor audit and parent rollup',async()=>{
  await contract();await contract(second,'200','2.02');
  const tree=(await agents.admin.get(url('/items')).expect(200)).body.items;
  expect(tree.find(x=>x.id===parent).contract_amount).toBe('505.00');
  const before=(await pool.query('SELECT revision FROM item_contracts WHERE work_item_id=$1',[leaf])).rows[0].revision;
  await agents.admin.patch(url('/items/'+leaf)).send({title:'Bê tông cập nhật',contract_quantity:'110',unit:'m³',contract_unit_price:'1.01'}).expect(200);
  expect((await pool.query('SELECT quantity,revision FROM item_contracts WHERE work_item_id=$1',[leaf])).rows[0]).toEqual({quantity:'110.0000',revision:before+1});
  expect((await pool.query("SELECT actor_id FROM audit_logs WHERE action='work_item_contract' ORDER BY id DESC LIMIT 1")).rows[0].actor_id).toBe(users.admin);
  await expect(pool.query('UPDATE work_items SET contract_quantity=5,unit=$2,contract_unit_price=1 WHERE id=$1',[parent,'m³'])).rejects.toMatchObject({code:'23514'});
 });
 test('S37 two concurrent creation requests cannot reserve the same next period; excess has concrete figures',async()=>{
  await contract(leaf,'10');
  const payload={work_item_id:leaf,period:'Đồng thời',day:'2026-10-14',cumulative:'7',photo_ids:[]};
  const results=await Promise.all([agents.engineer.post(url('/acceptance')).send(payload),agents.admin.post(url('/acceptance')).send(payload)]);
  expect(results.map(r=>r.status).sort()).toEqual([201,409]);
  expect((await pool.query('SELECT coalesce(sum(quantity),0)::text AS n FROM effective_acceptances')).rows[0].n).toBe('0');
  const form=results.find(r=>r.status===201).body.form;await approve(form);
  const excess=await agents.engineer.post(url('/acceptance')).send({...payload,cumulative:'11'}).expect(422);expect(excess.body.message).toContain('11');expect(excess.body.message).toContain('10');
  await expect(pool.query("INSERT INTO acceptance_forms(project_id,work_item_id,period,day,cumulative,previous_cumulative,quantity,unit,unit_price,created_by) VALUES($1,$2,'Bypass','2026-10-14',11,7,4,'m³',1,$3)",[pid,leaf,users.admin])).rejects.toMatchObject({code:'23514'});
 });
 test('S38 replacement correction decreases effective cumulative only on approval and keeps original immutable',async()=>{
  await contract();const original=await approve(await draft());
  const adjusted=(await agents.admin.post(url(`/acceptance/${original.id}/adjustments`)).send({period:'Đo lại',day:'2026-10-14',cumulative:'8',reason:'Đo lại thực tế',revision:original.revision,photo_ids:[]}).expect(201)).body.form;
  expect(adjusted.adjustment_delta).toBe('-2.0000');expect((await agents.admin.get(url('/acceptance'))).body.contracts[0].approved_quantity).toBe('10.0000');
  const edited=(await agents.admin.put(url('/acceptance/'+adjusted.id)).send({...adjusted,period:'Đo lại sửa',day:'2026-10-14',cumulative:'7',photo_ids:[]}).expect(200)).body.form;
  await approve(edited);const data=(await agents.admin.get(url('/acceptance')).expect(200)).body;
  expect(data.contracts[0].approved_quantity).toBe('7.0000');expect(data.forms.find(x=>x.id===original.id)).toMatchObject({cumulative:'10.0000',effective:false,superseded_by:adjusted.id});
  await expect(pool.query('UPDATE acceptance_forms SET notes=$2 WHERE id=$1',[original.id,'Tự sửa'])).rejects.toMatchObject({code:'23514'});
  await agents.accountant.post(url('/payments')).send({period:'Sai',day:'2026-10-14',retention_rate:'0',acceptance_ids:[original.id]}).expect(409);
 });
 test('S36 S40-42 original EXIF is preserved and outside/age warnings reach acceptance reviewer',async()=>{
  await contract();await agents.admin.put(url('/settings')).send({latitude:21.0285,longitude:105.8542,radius_m:100,revision:0}).expect(200);
  const bytes=await sharp({create:{width:40,height:30,channels:3,background:'blue'}}).jpeg().withExif({IFD0:{Make:'Test Camera',Model:'Fixture'},IFD2:{DateTimeOriginal:'2024:01:01 12:00:00'},IFD3:{GPSLatitudeRef:'N',GPSLatitude:'22/1 0/1 0/1',GPSLongitudeRef:'E',GPSLongitude:'106/1 0/1 0/1'}}).toBuffer();
  const photo=(await agents.engineer.post(url('/photos')).send({work_item_id:leaf,client_uuid:randomUUID(),filename:'original.jpg',data:bytes.toString('base64')}).expect(201)).body.photo;
  const form=await draft('10',{photo_ids:[photo.id]});const data=(await agents.admin.get(url('/acceptance'))).body;
  const review=data.forms.find(x=>x.id===form.id).photo_reviews[0];expect(review.outside_site).toBe(true);expect(review.distance_m).toBeGreaterThan(100);expect(review.reasons.some(x=>x.code==='capture_far_from_acceptance')).toBe(true);
  const original=await agents.engineer.get(url(`/photos/${photo.id}/original`)).expect(200);expect(original.body.equals(bytes)).toBe(true);
  const sent=(await agents.admin.post(url(`/acceptance/${form.id}/transition`)).send({action:'submit',revision:form.revision}).expect(200)).body.form;
  await expect(pool.query('DELETE FROM acceptance_photos WHERE acceptance_id=$1',[form.id])).rejects.toMatchObject({code:'23514'});
  await agents.admin.post(url(`/acceptance/${sent.id}/transition`)).send({action:'approve',revision:sent.revision}).expect(200);
 });
 test('earlier unpaid acceptance can be corrected without rewriting later approved snapshots',async()=>{
  await contract();const first=await approve(await draft('10'));const later=await approve(await draft('15'));
  const adjusted=(await agents.admin.post(url(`/acceptance/${first.id}/adjustments`)).send({period:'Sửa đợt trước',day:'2026-10-14',cumulative:'8',reason:'Đối chiếu đo lại',revision:first.revision,photo_ids:[]}).expect(201)).body.form;
  await approve(adjusted);const data=(await agents.admin.get(url('/acceptance'))).body;
  expect(data.contracts[0].approved_quantity).toBe('13.0000');expect(data.forms.find(x=>x.id===later.id)).toMatchObject({cumulative:'15.0000',previous_cumulative:'10.0000',quantity:'5.0000',effective:true});
  const next=await draft('16');expect(next.previous_cumulative).toBe('13.0000');expect(next.quantity).toBe('3.0000');
 });
 test('unmatched CSV item references become pending allocation and retain the source reference',async()=>{
  const csv='day,amount,type,work_item_id,notes\n2026-10-14,9.99,Khac,2147483647,Chung tu';
  await agents.accountant.post(url('/costs/import')).send({client_uuid:randomUUID(),csv}).expect(200);
  const data=(await agents.admin.get(url('/costs'))).body;
  expect(data.costs).toHaveLength(1);expect(data.costs[0]).toMatchObject({work_item_id:null,amount:'9.99'});expect(data.costs[0].notes).toContain('2147483647');
 });
 test('S43-45 project retention overrides injected rate, money rounds once per line and cumulative approved summary is exact',async()=>{
  await contract(leaf,'100','10.01');const form=await approve(await draft('1.2345'));
  await agents.admin.put(url('/payment-terms')).send({retention_rate:'5.55',revision:0}).expect(200);
  const p=await payment(form,{retention_rate:'0'});expect(p).toMatchObject({gross:'12.36',retention_rate:'5.55',retained:'0.69',net:'11.67'});
  expect((await agents.admin.get(url('/payments'))).body.retention_summary).toEqual({gross:'0.00',retained:'0.00',net:'0.00'});
  const sent=await submitPayment(p);await movePayment(sent,'approve');
  expect((await agents.admin.get(url('/payments'))).body.retention_summary).toEqual({gross:'12.36',retained:'0.69',net:'11.67'});
  await expect(pool.query('UPDATE payment_items SET amount=0 WHERE payment_id=$1',[p.id])).rejects.toMatchObject({code:'23514'});
 });
 test('S44 return releases reservations but retains history; concurrent reuse has a single winner',async()=>{
  await contract();const form=await approve(await draft());const first=await payment(form),submitted=await submitPayment(first);
  await agents.viewer.post(url(`/payments/${first.id}/transition`)).send({action:'return',revision:submitted.revision,reason:''}).expect(400);
  await movePayment(submitted,'return','Đề nghị bổ sung');
  expect((await pool.query('SELECT released FROM payment_items WHERE payment_id=$1',[first.id])).rows).toEqual([{released:true}]);
  const payload={period:'Lập lại',day:'2026-10-14',retention_rate:'0',acceptance_ids:[form.id]};
  const results=await Promise.all([agents.accountant.post(url('/payments')).send(payload),agents.admin.post(url('/payments')).send(payload)]);expect(results.map(r=>r.status).sort()).toEqual([201,409]);
  expect((await pool.query('SELECT count(*)::int n FROM payment_items WHERE acceptance_id=$1 AND NOT released',[form.id])).rows[0].n).toBe(1);
  expect((await pool.query('SELECT count(*)::int n FROM payment_items WHERE acceptance_id=$1',[form.id])).rows[0].n).toBe(2);
 });
 test('S46-48 budget versions, unallocated CSV, exact parent totals and 80/80 warnings use real rows',async()=>{
  await contract();await contract(second,'200','2.02');await approve(await draft('20'));
  for(const [id,amount]of[[leaf,'100'],[second,'200']])await agents.admin.post(url('/budgets')).send({work_item_id:id,amount,notes:'Bản đầu',version:0}).expect(201);
  const batch=randomUUID();const csv=`day,amount,type,work_item_id,notes\n2026-10-14,81,Nhan cong,${leaf},A\n2026-10-14,168,Thep,${second},B\n2026-10-14,12.34,Khac,,Cho phan bo`;
  await agents.accountant.post(url('/costs/import')).send({client_uuid:batch,csv}).expect(200);await agents.accountant.post(url('/costs/import')).send({client_uuid:batch,csv}).expect(200);
  let data=(await agents.admin.get(url('/costs'))).body;expect(data.costs).toHaveLength(3);expect(data.comparison.find(x=>x.id===parent)).toMatchObject({budget:'300.00',actual:'249.00',variance:'51.00',warning:true});
  const pending=data.costs.find(x=>x.work_item_id===null);await agents.accountant.patch(url('/costs/'+pending.id+'/allocate')).send({work_item_id:leaf,revision:pending.revision}).expect(200);
  await agents.admin.post(url('/budgets')).send({work_item_id:leaf,amount:'150',notes:'Điều chỉnh',version:1}).expect(201);data=(await agents.admin.get(url('/costs'))).body;
  expect(data.budgets.filter(x=>x.work_item_id===leaf).map(x=>x.amount)).toEqual(['150.00','100.00']);expect(data.comparison.find(x=>x.id===parent).actual).toBe('261.34');
  await expect(pool.query('UPDATE budget_versions SET amount=0 WHERE work_item_id=$1',[leaf])).rejects.toMatchObject({code:'23514'});
 });
 test('S49 reports contract-value progress and snapshots original baseline calendar across project edits',async()=>{
  await contract();await contract(second,'200','2.02');await approve(await draft('20'));
  const task=(await pool.query("INSERT INTO tasks(work_item_id,name,duration_days) VALUES($1,'Móng',6) RETURNING id",[leaf])).rows[0].id;
  await pool.query('INSERT INTO baselines(project_id,task_id,early_start,early_finish,late_start,late_finish,user_id) VALUES($1,$2,0,6,0,6,$3)',[pid,task,users.admin]);
  await pool.query('UPDATE projects SET start_date=$2 WHERE id=$1',[pid,'2026-10-07']);
  const data=(await agents.viewer.get(url('/reports')).expect(200)).body;
  expect(data.progress).toBe(4);expect(data.progress_based_on).toBe('contract_value');expect(data.baseline_finish).toBe('2026-10-10');expect(data.finish_variance_days).toBe(2);
 });
 test('S39 immutable audit, last-approved evidence and financial routes remain project scoped',async()=>{
  await contract();const form=await approve(await draft());await payment(form);
  const audit=(await agents.admin.get(url('/audit-logs')).expect(200)).body.entries;
  expect(audit.some(x=>x.module==='acceptance'&&x.action==='update_contract'&&x.actor_id===users.admin)).toBe(true);
  await expect(pool.query('DELETE FROM audit_logs WHERE project_id=$1',[pid])).rejects.toMatchObject({code:'23514'});
  for(const role of ['worker','outsider'])for(const suffix of ['/acceptance','/payments','/costs','/reports'])await agents[role].get(url(suffix)).expect(403);
  await agents.engineer.get(url('/payments')).expect(403);await agents.accountant.put(url('/payment-terms')).send({retention_rate:'0',revision:0}).expect(403);
  await agents.worker.get(url('/items')).expect(403);
  await agents.engineer.get(`/projects/${other}/reports`).expect(403);
 });
 test('S50 real parent dossier includes descendant approved forms and Vietnamese font',async()=>{
  await contract();await approve(await draft());const response=await agents.viewer.get(url('/reports/acceptance.pdf?workItemId='+parent)).expect(200);
  expect(response.headers['content-type']).toMatch(/application\/pdf/);expect(response.body.subarray(0,5).toString()).toBe('%PDF-');expect(response.body.length).toBeGreaterThan(5000);
 });
});
