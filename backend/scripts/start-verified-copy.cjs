// Local operator launcher for an already restored/upgraded copy. Never migrate,
// seed, bootstrap privileges or change the configured source database.
const fs=require('node:fs'),path=require('node:path');
require('../src/config/environment').loadEnvironment();
const {createDatabaseConfig}=require('../src/config/databaseConfig');
const {databaseName,targetDatabase}=require('../src/config/databaseTarget');
function verifiedCopyConfig(args,proof,config){
    if(args.some(arg=>!/^--(?:source|port)=/.test(arg)))throw new Error('Usage: --source=original|sprint45|merged --port=3082');
    const source=args.find(arg=>arg.startsWith('--source='))?.slice(9),port=Number(args.find(arg=>arg.startsWith('--port='))?.slice(7)|| ({original:3080,sprint45:3081,merged:3082}[source]));
    if(!['original','sprint45','merged'].includes(source)||!Number.isInteger(port)||port<1024||port>65535)throw new Error('Choose a verified source copy and a local port from 1024 to 65535.');
    const name=source==='merged'?proof.database:proof.cloneDatabase,pattern={original:/^construction_restore_test_\d+$/,sprint45:/^construction_legacy45_restore_test_\d+$/,merged:/^construction_merged_copy_\d+$/}[source];
    if(!proof.restoreVerified||!proof.upgradeVerified||!pattern.test(name)||name===databaseName(config)||name===proof.sourceDatabase||name===proof.originalDatabase||proof.sourceDatabases?.includes(name)||source==='merged'&&(!proof.mergeVerified||proof.authority!=='construction_sprint45_demo'||!proof.sourceDatabasesUnchanged))throw new Error('Refusing an original, unverified or unexpected database target.');
    return{source,port,database:name,connection:targetDatabase(config,name)};
}
async function main(args=process.argv.slice(2)){
    const source=args.find(arg=>arg.startsWith('--source='))?.slice(9);
    const file={sprint45:'legacy45-restore-upgrade.json',merged:'merged-copy.json',original:'restore-upgrade-copy.json'}[source]||'restore-upgrade-copy.json';
    const proof=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../docs/integration',file),'utf8'));
    const selected=verifiedCopyConfig(args,proof,createDatabaseConfig());
    if(selected.connection.connectionString)process.env.DATABASE_URL=selected.connection.connectionString;else process.env.DB_NAME=selected.database;
    Object.assign(process.env,{PORT:String(selected.port),NODE_ENV:'development',SESSION_COOKIE_SECURE:'false',APP_URL:`http://localhost:${selected.port}`,NOTIFICATION_WORKER_ENABLED:'false'});
    console.log(JSON.stringify({event:'verified_copy_selected',source:selected.source,database:selected.database,url:`http://localhost:${selected.port}/login`,automaticMigration:false}));
    await require('../src/server').main();
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={main,verifiedCopyConfig};
