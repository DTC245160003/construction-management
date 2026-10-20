const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Pool}=require('pg');
const {createDatabaseConfig}=require('../src/config/databaseConfig');
const {databaseName,targetDatabase}=require('../src/config/databaseTarget');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const root=path.resolve(__dirname,'../..');
const privateDir=path.join(root,'.private/integration');
const evidenceDir=path.join(root,'docs/integration');
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function inspect(database,{projection}={}){
 const pool=new Pool(targetDatabase(createDatabaseConfig(),database));
 const client=await pool.connect();
 try{
  await client.query('BEGIN READ ONLY');
  const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename);
  const counts={},fingerprints={},columns={};
  for(const table of tables){
   const safe='"'+table.replaceAll('"','""')+'"';
   counts[table]=(await client.query(`SELECT count(*)::int AS n FROM public.${safe}`)).rows[0].n;
   columns[table]=(await client.query("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[table])).rows;
   if(!['user_sessions','schema_migrations'].includes(table)){
    // Sort fixed-size row hashes in Node instead of sorting original image
    // bytes in PostgreSQL temporary files on the data drive.
    const fields=projection?.[table]?.map(c=>'"'+c.column_name.replaceAll('"','""')+'"').join(',');
    const relation=fields?`(SELECT ${fields} FROM public.${safe})`:`public.${safe}`;
    const rows=(await client.query(`SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS hash FROM ${relation} AS t`)).rows.map(r=>r.hash).sort();
    fingerprints[table]=digest(rows);
   }
  }
  const history=tables.includes('schema_migrations')?(await client.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows:[];
  const users=tables.includes('users')?(await client.query('SELECT * FROM users ORDER BY id')).rows:[];
  const roles=tables.includes('roles')?(await client.query('SELECT * FROM roles ORDER BY id')).rows:[];
  await client.query('ROLLBACK');
  return{database,counts,fingerprints,columns,history,users,roles};
 }finally{client.release();await pool.end();}
}
async function main(){
 fs.mkdirSync(privateDir,{recursive:true});fs.mkdirSync(evidenceDir,{recursive:true});
 const originalName=databaseName(createDatabaseConfig());
 const admin=new Pool(targetDatabase(createDatabaseConfig(),'postgres'));
 try{
  const available=(await admin.query('SELECT datname FROM pg_database WHERE NOT datistemplate')).rows.map(r=>r.datname);
  const names=[...new Set([originalName,'construction_sprint45_demo','construction_sprint68_test'])].filter(n=>available.includes(n));
  const data=[];for(const name of names)data.push(await inspect(name));
  const original=data.find(d=>d.database===originalName);
  const baseline=path.join(privateDir,'original-database-baseline.json');
  if(original&&!fs.existsSync(baseline))fs.writeFileSync(baseline,JSON.stringify(original,null,2));
  const summary={checkedAt:new Date().toISOString(),configuredOriginal:originalName,originalFound:Boolean(original),databases:data.map(d=>({database:d.database,counts:d.counts,history:d.history,roles:d.roles.map(r=>({id:r.id,name:r.name})),userCount:d.users.length,passwordFormats:[...new Set(d.users.map(u=>String(u.password_hash||u.password||'').startsWith('$argon2')?'argon2':String(u.password_hash||u.password||'').startsWith('$2')?'bcrypt':'other'))],userColumns:d.columns.users?.map(c=>c.column_name)}))};
  fs.writeFileSync(path.join(evidenceDir,'database-preflight.json'),JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary));
 }finally{await admin.end();}
}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({code:e.code,message:e.message}));process.exitCode=1;});
module.exports={inspect,digest};
