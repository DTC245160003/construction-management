const path=require('node:path');
const {Pool}=require('pg');
const {testDatabase}=require('./test-sprint68.cjs');
const {runMigrations}=require('../src/run-migration');
const {seedRoles}=require('../src/seed-roles');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
async function main(){
 const url=await testDatabase();
 const pool=new Pool({connectionString:url});
 try{const c=await pool.connect();try{
  if((await c.query('SELECT current_database() AS name')).rows[0].name!=='construction_sprint68_test')throw new Error('Refusing to migrate any database other than the isolated Sprint 6-8 test database');
  for(const line of await runMigrations({client:c}))console.log(line);await seedRoles(c);
 }finally{c.release();}}finally{await pool.end();}
 // DATABASE_URL takes precedence; keep runtime on the database just verified.
 process.env.DATABASE_URL=url;process.env.DB_NAME='construction_sprint68_test';process.env.PORT=process.env.SPRINT68_DEMO_PORT||'3068';
 process.env.SMTP_HOST='';process.env.SMTP_FROM='';
 console.log('Local test demo only: construction_sprint68_test. No application/demo production databases were migrated; register a test account and grant privileges manually with admin:bootstrap.');
 process.env.NODE_ENV='development';process.env.SESSION_COOKIE_SECURE='false';
 const app=require('../src/app');
 app.listen(Number(process.env.PORT),'127.0.0.1',()=>console.log(`Test demo backend: http://127.0.0.1:${process.env.PORT}`));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
