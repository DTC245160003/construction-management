const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {Pool}=require('pg');
const fs=require('node:fs');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const {createDatabaseConfig}=require('../src/config/databaseConfig');
const {databaseName,targetDatabase}=require('../src/config/databaseTarget');
const {assertFreeSpace}=require('./restore-upgrade-copy.cjs');
async function testDatabase(){
 const original=createDatabaseConfig();
 // A provided test URL is honored by CI; never accept the application's DB.
 if(process.env.SPRINT2_TEST_DATABASE_URL){
  const test={connectionString:process.env.SPRINT2_TEST_DATABASE_URL};
  const name=databaseName(test);
  if(name===databaseName(original)||!/(?:_test|_restore_test)$/.test(name))throw new Error('Configure an isolated test database distinct from the application database.');
  if(process.platform==='win32'&&['localhost','127.0.0.1','[::1]','::1'].includes(new URL(test.connectionString).hostname))assertFreeSpace();
  return test.connectionString;
 }
 const database='construction_sprint68_test';
 if(database===databaseName(original))throw new Error('Test database must differ from the application database');
 const host=original.connectionString?new URL(original.connectionString).hostname:original.host||'localhost';
 if(process.platform==='win32'&&['localhost','127.0.0.1','[::1]','::1'].includes(host))assertFreeSpace();
 const admin=new Pool(targetDatabase(original,'postgres'));
 try{if(!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount)await admin.query('CREATE DATABASE construction_sprint68_test');}finally{await admin.end();}
 if(original.connectionString)return targetDatabase(original,database).connectionString;
 const url=new URL('postgresql://localhost');url.hostname=original.host||'localhost';url.port=String(original.port||5432);url.username=original.user||'postgres';if(original.password)url.password=original.password;url.pathname='/'+database;
 return url.href;
}
async function main(){
 const url=await testDatabase();
 const args=process.argv.slice(2),frontend=args[0]==='--frontend';if(frontend)args.shift();
 const command=process.execPath;
 const npmCli=process.env.npm_execpath||path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
 const commandArgs=frontend?[npmCli,'run',...args]:[require.resolve('jest/bin/jest'),'--runInBand',...args];
 console.log('Testing only the isolated test database; application databases are not migrated.');
 const env={...process.env,SPRINT2_TEST_DATABASE_URL:url};
 // Browser profiles and original-photo fixtures can exceed the remaining system
 // drive space. Keep this runner's temporary files in its ignored test workspace.
 if(process.platform==='win32'){
  const temp=path.resolve(__dirname,'../../.tmp/sprint68-runtime');fs.mkdirSync(temp,{recursive:true});
  Object.assign(env,{TEMP:temp,TMP:temp,TMPDIR:temp});
 }
 const result=spawnSync(command,commandArgs,{cwd:path.join(__dirname,frontend?'../../frontend':'..'),env,stdio:'inherit'});
 if(result.error)throw result.error;process.exitCode=result.status||0;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={testDatabase};
