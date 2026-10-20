// Explicitly approved, local-only reconciliation. Sources are READ ONLY.
// Restores two fresh copies; imports atomically into the new Sprint 4-5 copy.
const fs=require('node:fs'),path=require('node:path');
const {Pool,types}=require('pg');
require('../src/config/environment').loadEnvironment();
const {createDatabaseConfig}=require('../src/config/databaseConfig');
const {databaseName,targetDatabase}=require('../src/config/databaseTarget');
const {run}=require('./backup-original.cjs');
const {inspect}=require('./integration-preflight.cjs');
const {assertFreeSpace,verifyBackup,compareSnapshots}=require('./restore-upgrade-copy.cjs');
const {runMigrations}=require('../src/run-migration');
const root=path.resolve(__dirname,'../..');
const approvedEmail='dtc245160003@ictu.edu.vn';
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const dateTypes=new Set([1082,1114,1184]);
const readJson=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8').replace(/^\uFEFF/,''));
const save=(file,data)=>fs.writeFileSync(path.join(root,file),JSON.stringify(data,null,2));
const poolFor=name=>new Pool({...targetDatabase(createDatabaseConfig(),name),types:{getTypeParser:(oid,format)=>dateTypes.has(oid)?value=>value:types.getTypeParser(oid,format)}});
function canonical(value){
 if(Buffer.isBuffer(value))return value.toString('hex');
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
async function readData(client){
 const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename);
 const data={};for(const table of tables)data[table]=(await client.query(`SELECT * FROM public.${quote(table)}`)).rows;
 const columns=(await client.query("SELECT table_name,column_name,data_type,column_default FROM information_schema.columns c WHERE table_schema='public' AND table_name=ANY($1) ORDER BY table_name,ordinal_position",[tables])).rows;
 const constraints=(await client.query(`SELECT c.contype,c.conname,c.conrelid::regclass::text AS table_name,c.confrelid::regclass::text AS referenced_table,
  to_json(ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(n,i) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY k.i)) AS columns,
  to_json(ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY k(n,i) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.n ORDER BY k.i)) AS referenced_columns
  FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype IN('p','f')`)).rows;
 return{data,columns,constraints};
}
function buildMaps(source,base){
 const maps={},duplicates=[];
 for(const [table,rows]of Object.entries(source.data)){
  const pk=source.constraints.find(c=>c.contype==='p'&&c.table_name===table);
  if(!pk||!equal(pk.columns,['id']))continue;
  const existing=base.data[table];if(!existing)throw new Error(`Target lacks table ${table}`);
  const map=new Map();let next=existing.reduce((n,r)=>Math.max(n,Number(r.id)),0);
  const seen=new Set();
  for(const row of rows){
   let matching;
   if(table==='roles')matching=existing.find(r=>r.name===row.name);
   if(table==='users'){
    const email=row.email.trim().toLowerCase();if(seen.has(email))throw new Error('Source has duplicate normalized emails');seen.add(email);
    matching=existing.find(r=>r.email.trim().toLowerCase()===email);
    if(matching){
     if(email!==approvedEmail||matching.system_role!=='super_admin'||matching.is_active!==true)throw new Error('Unapproved duplicate identity or unexpected authoritative profile');
     duplicates.push({sourceId:row.id,targetId:matching.id,policy:'keep_entire_sprint45_profile'});
    }
   }
   if(table==='roles'&&!matching)throw new Error('Unreviewed role definition; refusing to invent permissions');
   map.set(String(row.id),matching?matching.id:++next);
  }
  maps[table]=map;
 }
 if(duplicates.length!==1)throw new Error('Expected exactly the explicitly approved duplicate');
 return{maps,duplicates};
}
function mappingTable(schema,table,column,seen=new Set()){
 const key=`${table}.${column}`;if(seen.has(key))throw new Error('Ambiguous foreign key mapping');seen.add(key);
 const pk=schema.constraints.find(c=>c.contype==='p'&&c.table_name===table);
 if(column==='id'&&equal(pk?.columns,['id']))return table;
 const fks=schema.constraints.filter(c=>c.contype==='f'&&c.table_name===table&&c.columns.includes(column));
 if(!fks.length)return null;
 const targets=fks.map(fk=>mappingTable(schema,fk.referenced_table,fk.referenced_columns[fk.columns.indexOf(column)],new Set(seen)));
 if(new Set(targets).size!==1||!targets[0])throw new Error(`Ambiguous mapping for ${key}`);
 return targets[0];
}
function remapRow(schema,table,row,maps){
 const result={...row};
 for(const column of Object.keys(row)){
  const target=mappingTable(schema,table,column);
  if(target&&row[column]!==null){
   const value=maps[target]?.get(String(row[column]));
   if(value===undefined)throw new Error(`Unmapped relationship ${table}.${column}`);
   result[column]=value;
  }
 }
 return result;
}
function importOrder(schema,tables){
 const remaining=new Set(tables),ordered=[];
 while(remaining.size){
  const ready=[...remaining].filter(table=>!schema.constraints.some(c=>c.contype==='f'&&c.table_name===table&&c.referenced_table!==table&&remaining.has(c.referenced_table)));
  if(!ready.length)throw new Error('Foreign key cycle requires explicit reconciliation');
  ready.sort().forEach(table=>{remaining.delete(table);ordered.push(table);});
 }
 return ordered;
}
function orderedRows(schema,table,rows){
 const self=schema.constraints.filter(c=>c.contype==='f'&&c.table_name===table&&c.referenced_table===table);
 if(!self.length)return rows;
 const result=[],pending=[...rows];
 while(pending.length){
  const index=pending.findIndex(row=>!self.some(fk=>pending.some(other=>other!==row&&fk.columns.every((col,i)=>row[col]!==null&&String(row[col])===String(other[fk.referenced_columns[i]])))));
  if(index<0)throw new Error(`Cyclic self reference in ${table}`);
  result.push(...pending.splice(index,1));
 }
 return result;
}
async function createFresh(name){
 if(!/^construction_(?:merged_copy|merge_staging)_\d+$/.test(name)||['construction_management','construction_sprint45_demo',databaseName(createDatabaseConfig())].includes(name))throw new Error('Unsafe new database name');
 const pool=poolFor('postgres');try{
  if((await pool.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount)throw new Error('Target already exists; no overwrite allowed');
  await pool.query(`CREATE DATABASE ${quote(name)}`);
 }finally{await pool.end();}
}
async function restoreAndUpgrade(name,proof,baseline){
 const backup=verifyBackup(proof);await createFresh(name);
 run('pg_restore',['--exit-on-error','--no-owner','--no-privileges','--no-password','--dbname',name,backup],name);
 const restored=await inspect(name);compareSnapshots(baseline,restored);
 const pool=poolFor(name);try{const client=await pool.connect();try{await runMigrations({client});}finally{client.release();}}finally{await pool.end();}
 const upgraded=await inspect(name,{projection:baseline.columns});return compareSnapshots(baseline,upgraded);
}
async function verifyForeignKeys(client,schema){
 let checked=0;
 for(const fk of schema.constraints.filter(c=>c.contype==='f')){
  const match=fk.columns.map((col,i)=>`s.${quote(col)}=t.${quote(fk.referenced_columns[i])}`).join(' AND ');
  const present=fk.columns.map(col=>`s.${quote(col)} IS NOT NULL`).join(' AND ');
  const n=(await client.query(`SELECT count(*)::int AS n FROM public.${quote(fk.table_name)} s WHERE ${present} AND NOT EXISTS(SELECT 1 FROM public.${quote(fk.referenced_table)} t WHERE ${match})`)).rows[0].n;
  if(n)throw new Error(`Orphaned foreign key ${fk.conname}`);checked++;
 }
 return checked;
}
async function mergeInto(client,source,base){
 const {maps,duplicates}=buildMaps(source,base);
 const skip=new Set(['schema_migrations','system_admin_guard','roles','user_sessions']);
 if(source.data.user_sessions.length||base.data.user_sessions.length)throw new Error('Session data requires explicit secure remapping; refusing to carry authenticated sessions');
 // Current original source has no historical JSON/finance rows. Unknown snapshot
 // references must stop this reconciliation, never be copied with stale IDs.
 for(const col of source.columns.filter(c=>['json','jsonb'].includes(c.data_type)))if(source.data[col.table_name].some(r=>r[col.column_name]!==null))throw new Error(`JSON relationship review required: ${col.table_name}.${col.column_name}`);
 for(const snapshot of [source,base]){
  const active=snapshot.data.users.filter(u=>u.system_role==='super_admin'&&u.is_active).length;
  if(snapshot.data.system_admin_guard.length!==1||snapshot.data.system_admin_guard[0].active_count!==active)throw new Error('System guard does not match active administrators');
 }
 const tables=importOrder(source,Object.keys(source.data).filter(t=>!skip.has(t)&&source.data[t].length));
 const sideEffects=[['projects','projects_seed_calendar'],['projects','journal_catalog_defaults'],['tasks','tasks_mark_schedule_dirty'],['dependencies','dependencies_mark_schedule_dirty'],['project_calendars','calendar_dirty'],['project_holidays','holidays_dirty']];
 // Only these derived-data side effects are suspended on the NEW target, inside
 // this transaction. ALL FK, CHECK and financial/auth/history guards stay active.
 for(const [table,trigger]of sideEffects)await client.query(`ALTER TABLE public.${quote(table)} DISABLE TRIGGER ${quote(trigger)}`);
 const imported={},expected={};
 for(const table of tables){
  expected[table]=[];imported[table]=0;
  const columns=source.columns.filter(c=>c.table_name===table);
  for(const row of orderedRows(source,table,source.data[table])){
   if(table==='users'&&duplicates.some(d=>String(d.sourceId)===String(row.id)))continue;
   const mapped=remapRow(source,table,row,maps);
   const values=columns.map(c=>['json','jsonb'].includes(c.data_type)&&mapped[c.column_name]!==null?JSON.stringify(mapped[c.column_name]):mapped[c.column_name]);
   await client.query(`INSERT INTO public.${quote(table)} (${columns.map(c=>quote(c.column_name)).join(',')}) VALUES (${values.map((_,i)=>'$'+(i+1)).join(',')})`,values);
   expected[table].push(mapped);imported[table]++;
  }
 }
 for(const [table,trigger]of sideEffects)await client.query(`ALTER TABLE public.${quote(table)} ENABLE TRIGGER ${quote(trigger)}`);
 const after=await readData(client);
 const keyFor=(schema,table,row)=>JSON.stringify(schema.constraints.find(c=>c.contype==='p'&&c.table_name===table).columns.map(c=>row[c]));
 for(const [table,rows]of Object.entries(base.data)){
  const byKey=new Map(after.data[table].map(row=>[keyFor(base,table,row),row]));
  for(const row of rows)if(!equal(row,byKey.get(keyFor(base,table,row))))throw new Error(`Authoritative base data changed: ${table}`);
  for(const row of expected[table]||[])if(!equal(row,byKey.get(keyFor(base,table,row))))throw new Error(`Mapped source data differs: ${table}`);
  if(after.data[table].length!==rows.length+(imported[table]||0))throw new Error(`Count mismatch: ${table}`);
 }
 if((await client.query('SELECT lower(email) FROM users GROUP BY lower(email) HAVING count(*)>1')).rowCount)throw new Error('Duplicate account after merge');
 const foreignKeysChecked=await verifyForeignKeys(client,source);
 const disabled=(await client.query("SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND t.tgenabled<>'O'")).rows[0].n;
 if(disabled)throw new Error('A trigger remains disabled');
 // Explicit IDs must not leave SERIAL sequences behind the imported rows.
 const sequences=[];
 for(const col of source.columns.filter(c=>c.column_default?.startsWith('nextval('))){
  const sequence=(await client.query('SELECT pg_get_serial_sequence($1,$2) AS name',[`public.${quote(col.table_name)}`,col.column_name])).rows[0].name;
  if(!sequence)throw new Error('Missing identity sequence');
  const max=(await client.query(`SELECT max(${quote(col.column_name)})::text AS value FROM public.${quote(col.table_name)}`)).rows[0].value;
  if(max!==null)await client.query('SELECT setval($1::regclass,$2::bigint,true)',[sequence,max]);
  sequences.push({table:col.table_name,column:col.column_name,max});
 }
 return{maps:Object.fromEntries(Object.entries(maps).map(([table,map])=>[table,Object.fromEntries(map)])),duplicates,imported,counts:Object.fromEntries(Object.entries(after.data).map(([table,rows])=>[table,rows.length])),foreignKeysChecked,allTriggersEnabled:true,authoritativeRowsUnchanged:true,allImportedRowsExactlyMatchMapping:true,sequences};
}
async function main(){
 if(!process.argv.includes('--approved-sprint45-authority'))throw new Error('Explicit operator selection required: --approved-sprint45-authority');
 const freeBytesBefore=assertFreeSpace();
 const originalBaseline=readJson('.private/integration/merge-construction_management-baseline.json');
 const legacyBaseline=readJson('.private/integration/merge-construction_sprint45_demo-baseline.json');
 for(const baseline of [originalBaseline,legacyBaseline])compareSnapshots(baseline,await inspect(baseline.database));
 const originalProof=readJson('docs/integration/original-backup.json'),legacyProof=readJson('docs/integration/legacy45-restore-upgrade.json');
 if(originalProof.database!==originalBaseline.database||legacyProof.sourceDatabase!==legacyBaseline.database||!originalProof.restoreVerified||!legacyProof.restoreVerified||!legacyProof.upgradeVerified)throw new Error('Unverified backup source');
 verifyBackup(originalProof);verifyBackup(legacyProof);
 const stamp=Date.now(),staging=`construction_merge_staging_${stamp}`,target=`construction_merged_copy_${stamp}`;
 const restores={original:await restoreAndUpgrade(staging,originalProof,originalBaseline),sprint45:await restoreAndUpgrade(target,legacyProof,legacyBaseline)};
 const sourcePool=poolFor(staging),targetPool=poolFor(target);let result;
 try{
  const sourceClient=await sourcePool.connect(),targetClient=await targetPool.connect();
  try{
   await sourceClient.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const source=await readData(sourceClient);await sourceClient.query('ROLLBACK');
   await targetClient.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
   try{const base=await readData(targetClient);result=await mergeInto(targetClient,source,base);await targetClient.query('COMMIT');}
   catch(error){await targetClient.query('ROLLBACK');throw error;}
  }finally{sourceClient.release();targetClient.release();}
 }finally{await sourcePool.end();await targetPool.end();}
 const sources={};for(const baseline of [originalBaseline,legacyBaseline])sources[baseline.database]=compareSnapshots(baseline,await inspect(baseline.database));
 save('.private/integration/merged-id-mapping.json',{target,staging,...result});
 const proof={checkedAt:new Date().toISOString(),database:target,stagingDatabase:staging,sourceDatabases:[originalBaseline.database,legacyBaseline.database],authority:'construction_sprint45_demo',approvedDuplicateEmail:approvedEmail,ownerApprovalDateLocal:'2026-10-15',mergeVerified:true,restoreVerified:true,upgradeVerified:true,originalDatabaseModified:false,sourceDatabasesUnchanged:true,freeBytesBefore,freeBytesAfter:assertFreeSpace(),restores,sourcePreservation:sources,...result};
 save('docs/integration/merged-copy.json',proof);
 console.log(JSON.stringify({database:target,stagingDatabase:staging,counts:result.counts,foreignKeysChecked:result.foreignKeysChecked,sourceDatabasesUnchanged:true,mergeVerified:true}));
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({message:error.message,code:error.code||null}));process.exitCode=1;});
module.exports={buildMaps,mappingTable,remapRow,importOrder,orderedRows,mergeInto,readData,poolFor,equal,verifyForeignKeys};
