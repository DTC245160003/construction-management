const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const {createDatabaseConfig}=require('../src/config/databaseConfig');
const {databaseName,targetDatabase,libpqEnvironment}=require('../src/config/databaseTarget');
function postgresBinary(name){
 const folder=process.env.PG_BIN||(process.platform==='win32'?'C:/Program Files/PostgreSQL/17/bin':'');
 return folder?path.join(folder,name+(process.platform==='win32'?'.exe':'')):name;
}
function pgEnvironment(database){return libpqEnvironment(targetDatabase(createDatabaseConfig(),database));}
function run(name,args,database){
 const result=spawnSync(postgresBinary(name),args,{env:pgEnvironment(database),encoding:'utf8'});
 if(result.error)throw result.error;
 if(result.status!==0)throw new Error(`${name} failed (exit ${result.status}); preserve any incomplete archive or rehearsal copy for diagnosis. ${(result.stderr||'').slice(0,300)}`);
 return result.stdout;
}
function main(){
 const database=databaseName(createDatabaseConfig());
 if(!database||!/^\w+$/.test(database))throw new Error('Configure the original DB_NAME before backup');
 const folder=path.resolve(__dirname,'../../.private/integration/backups');fs.mkdirSync(folder,{recursive:true});
 const stamp=new Date().toISOString().replaceAll(/[:.]/g,'-'),file=path.join(folder,`${database}-${stamp}.dump`),partial=file+'.partial';
 run('pg_dump',['--format=custom','--no-password','--file',partial],database);
 const inventory=run('pg_restore',['--list',partial],database);
 for(const table of ['users','roles','projects','work_items','schema_migrations'])if(!inventory.includes(`TABLE DATA public ${table} `))throw new Error(`Backup inventory is missing ${table}; partial archive preserved for diagnosis`);
 fs.renameSync(partial,file);fs.writeFileSync(file+'.list.txt',inventory);
 const proof={database,file,bytes:fs.statSync(file).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),inventoryVerified:true,restoreVerified:false,createdAt:new Date().toISOString()};
 fs.mkdirSync(path.resolve(__dirname,'../../docs/integration'),{recursive:true});
 fs.writeFileSync(path.resolve(__dirname,'../../docs/integration/original-backup.json'),JSON.stringify(proof,null,2));
 console.log(JSON.stringify(proof));
}
if(require.main===module){try{main();}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={postgresBinary,pgEnvironment,run};
