// Local safety rehearsal. Creates one new database and NEVER drops databases,
// overwrites an existing database, or migrates the configured original.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Pool}=require('pg');
require('../src/config/environment').loadEnvironment();
const {createDatabaseConfig}=require('../src/config/databaseConfig');
const {databaseName,targetDatabase}=require('../src/config/databaseTarget');
const {run}=require('./backup-original.cjs');
const {inspect}=require('./integration-preflight.cjs');
const {runMigrations}=require('../src/run-migration');
const root=path.resolve(__dirname,'../..');
const proofPath=path.join(root,'docs/integration/original-backup.json');
const baselinePath=path.join(root,'.private/integration/original-database-baseline.json');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function assertFreeSpace(folder=process.env.PGDATA_DIRECTORY||(process.platform==='win32'?'C:/':null)){
    if(!folder)throw new Error('Set PGDATA_DIRECTORY to the local PostgreSQL data volume before rehearsal.');
    const stat=fs.statfsSync(folder,{bigint:true}),free=stat.bavail*stat.bsize;
    if(free<2n*1024n*1024n*1024n)throw new Error('PostgreSQL data volume has less than 2 GiB free. No database connection or write was attempted.');
    return Number(free);
}
function verifyBackup(proof){
    const backup=path.resolve(proof.file),folder=path.resolve(root,'.private/integration/backups')+path.sep;
    if(!backup.startsWith(folder)||!proof.inventoryVerified||!fs.existsSync(backup))throw new Error('Backup path or inventory is not verified.');
    const bytes=fs.readFileSync(backup);
    if(bytes.length!==proof.bytes||hash(bytes)!==proof.sha256)throw new Error('Backup size or SHA-256 differs from its manifest.');
    return backup;
}
function compareSnapshots(before,after){
    const problems=[];
    for(const [table,count]of Object.entries(before.counts)){
        if(['schema_migrations','user_sessions'].includes(table))continue;
        if(after.counts[table]!==count)problems.push(`${table}: row count differs`);
        if(before.fingerprints[table]!==after.fingerprints[table])problems.push(`${table}: original column data differs`);
    }
    for(const entry of before.history)if(!after.history.some(row=>row.name===entry.name&&row.checksum===entry.checksum))problems.push(`${entry.name}: recorded history differs`);
    if(problems.length)throw new Error('Preservation verification failed: '+problems.join('; '));
    return{tables:Object.keys(before.counts).filter(t=>!['schema_migrations','user_sessions'].includes(t)).length,users:before.counts.users,oldMigrationRecords:before.history.length,originalColumnsUnchanged:true};
}
async function main(){
    // This guard runs BEFORE any pg_dump/restore/Pool operation.
    const freeBytes=assertFreeSpace();
    const config=createDatabaseConfig(),original=databaseName(config);
    const proof=JSON.parse(fs.readFileSync(proofPath,'utf8')),baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8'));
    if(proof.database!==original||baseline.database!==original)throw new Error('Backup/baseline do not identify the configured original database.');
    const backup=verifyBackup(proof);
    const inventory=run('pg_restore',['--list',backup],original);
    for(const table of ['users','roles','projects','work_items','schema_migrations'])if(!inventory.includes(`TABLE DATA public ${table} `))throw new Error('Archive inventory is incomplete.');
    const clone=`construction_restore_test_${Date.now()}`;
    if(clone===original||!/^construction_restore_test_\d+$/.test(clone))throw new Error('Unsafe rehearsal target.');
    const admin=new Pool(targetDatabase(config,'postgres'));
    try{
        if((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[clone])).rowCount)throw new Error('Rehearsal database already exists; it will not be overwritten.');
        await admin.query(`CREATE DATABASE "${clone}"`);
    }finally{await admin.end();}
    // No --clean and no DROP. Failed copies remain available for diagnosis.
    run('pg_restore',['--exit-on-error','--no-owner','--no-privileges','--no-password','--dbname',clone,backup],clone);
    const restored=await inspect(clone);
    const restoredCheck=compareSnapshots(baseline,restored);
    const pool=new Pool(targetDatabase(config,clone));
    let messages;
    try{const client=await pool.connect();try{messages=await runMigrations({client});}finally{client.release();}}
    finally{await pool.end();}
    const upgraded=await inspect(clone,{projection:restored.columns});
    const preservation=compareSnapshots(restored,upgraded);
    const evidence={checkedAt:new Date().toISOString(),originalDatabase:original,cloneDatabase:clone,freeBytesBefore:freeBytes,backupSha256:proof.sha256,restoreVerified:true,upgradeVerified:true,restoredCheck,preservation,migrations:messages,originalDatabaseModified:false,oldCredentialLoginVerified:false};
    fs.writeFileSync(path.join(root,'.private/integration/upgraded-copy-snapshot.json'),JSON.stringify(upgraded,null,2));
    fs.writeFileSync(path.join(root,'docs/integration/restore-upgrade-copy.json'),JSON.stringify(evidence,null,2));
    // Only set this flag after an actual successful restore AND preservation check.
    fs.writeFileSync(proofPath,JSON.stringify({...proof,restoreVerified:true,restoreVerifiedAt:evidence.checkedAt,restoredClone:clone},null,2));
    console.log(JSON.stringify(evidence));
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={assertFreeSpace,verifyBackup,compareSnapshots};
