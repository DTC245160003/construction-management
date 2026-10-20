// Consistent READ ONLY snapshot of the active merged copy. Restore validation
// always creates a separate fresh database and cannot touch the active copy.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {poolFor,readData,equal,verifyForeignKeys}=require('./merge-database-copy.cjs');
const {assertFreeSpace}=require('./restore-upgrade-copy.cjs');
const {run}=require('./backup-original.cjs');
const root=path.resolve(__dirname,'../..');
async function main(){
 const freeBytesBefore=assertFreeSpace();
 const merge=JSON.parse(fs.readFileSync(path.join(root,'docs/integration/merged-copy.json'),'utf8'));
 if(!merge.mergeVerified||!/^construction_merged_copy_\d+$/.test(merge.database)||merge.sourceDatabases.includes(merge.database))throw new Error('Not a verified merged copy');
 const stamp=Date.now(),target=`construction_merged_backup_test_${stamp}`;
 const file=path.join(root,`.private/integration/backups/${merge.database}-${stamp}.dump`),partial=file+'.partial';
 const pool=poolFor(merge.database);let baseline;
 try{
  const client=await pool.connect();try{
   await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const snapshot=(await client.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
   baseline=await readData(client);
   run('pg_dump',['--format=custom','--no-password','--snapshot',snapshot,'--file',partial],merge.database);
   await client.query('ROLLBACK');
  }finally{client.release();}
 }finally{await pool.end();}
 const inventory=run('pg_restore',['--list',partial],merge.database);
 for(const table of Object.keys(baseline.data))if(!inventory.includes(`TABLE DATA public ${table} `))throw new Error(`Archive lacks ${table}`);
 fs.renameSync(partial,file);fs.writeFileSync(file+'.list.txt',inventory);
 const admin=poolFor('postgres');try{
  if((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[target])).rowCount)throw new Error('Restore target already exists');
  await admin.query(`CREATE DATABASE "${target}"`);
 }finally{await admin.end();}
 run('pg_restore',['--exit-on-error','--no-owner','--no-privileges','--no-password','--dbname',target,file],target);
 const restored=poolFor(target);let foreignKeysChecked;
 try{
  const client=await restored.connect();try{
   await client.query('BEGIN READ ONLY');const after=await readData(client);
   const digest=rows=>rows.map(row=>JSON.stringify(row,(_,v)=>Buffer.isBuffer(v)?v.toString('hex'):v)).sort();
   for(const [table,rows]of Object.entries(baseline.data))if(!equal(digest(rows),digest(after.data[table])))throw new Error(`Restored data mismatch: ${table}`);
   foreignKeysChecked=await verifyForeignKeys(client,after);await client.query('ROLLBACK');
  }finally{client.release();}
 }finally{await restored.end();}
 const proof={checkedAt:new Date().toISOString(),database:merge.database,restoredDatabase:target,file,bytes:fs.statSync(file).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),consistentExportedSnapshot:true,inventoryVerified:true,restoreVerified:true,allTablesAndColumnsEqual:true,tableCounts:Object.fromEntries(Object.entries(baseline.data).map(([table,rows])=>[table,rows.length])),foreignKeysChecked,activeMergedDatabaseModified:false,sourceDatabasesModified:false,freeBytesBefore};
 fs.writeFileSync(path.join(root,'docs/integration/merged-backup-restore.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify({database:merge.database,restoredDatabase:target,restoreVerified:true,tables:Object.keys(baseline.data).length,bytes:proof.bytes,foreignKeysChecked}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
