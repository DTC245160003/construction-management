// Same-origin Samsung rehearsal. Keep Android localhost:4174 storage intact;
// adb reverse maps it to this explicitly verified merged-copy process.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
require('../src/config/environment').loadEnvironment();
const {createDatabaseConfig}=require('../src/config/databaseConfig');
const {verifiedCopyConfig}=require('./start-verified-copy.cjs');
const root=path.resolve(__dirname,'../..'),stateFile=path.join(root,'.private/integration/samsung-sync-control.json');
const runtimeFile=path.join(root,'.private/integration/samsung-runtime.json');
function writeGate({enabled=()=>false}={}){
 return(req,res,next)=>{
  if(['GET','HEAD','OPTIONS'].includes(req.method)||['/auth/login','/auth/logout'].includes(req.path)||enabled())return next();
  return res.status(503).json({message:'Đang kiểm tra dữ liệu offline cũ trước khi chuyển sang bản hợp nhất. Bản nháp vẫn được giữ trên thiết bị; chưa đồng bộ.',code:'SAMSUNG_SYNC_REVIEW_HOLD'});
 };
}
async function main(args=process.argv.slice(2)){
 const proof=JSON.parse(fs.readFileSync(path.join(root,'docs/integration/merged-copy.json'),'utf8'));
 const selected=verifiedCopyConfig(['--source=merged','--port=4174'],proof,createDatabaseConfig());
 const directory=path.join(root,'.tmp/samsung-pwa-dist'),worker=path.join(directory,'journal-sw.js');
 if(!fs.existsSync(worker)||fs.readFileSync(worker,'utf8').includes('__XDS_BUILD__'))throw new Error('Build the versioned Samsung production shell first.');
 const build=crypto.createHash('sha256').update(fs.readFileSync(worker)).digest('hex');
 if(args.includes('--enable-sync')){
  if(!args.includes('--offline-source-reviewed'))throw new Error('Confirm old offline source/IDs before enabling business writes.');
  const runtime=JSON.parse(fs.readFileSync(runtimeFile,'utf8'));
  if(runtime.database!==selected.database||runtime.build!==build)throw new Error('Runtime/build changed; recheck before enabling sync');
  fs.writeFileSync(stateFile,JSON.stringify({database:selected.database,build,enabled:true,reviewedAt:new Date().toISOString()},null,2));
  console.log('Samsung business writes enabled for the verified merged copy.');return;
 }
 if(args.length)throw new Error('Usage: samsung-pwa.cjs [--enable-sync --offline-source-reviewed]');
 if(selected.connection.connectionString)process.env.DATABASE_URL=selected.connection.connectionString;else process.env.DB_NAME=selected.database;
 Object.assign(process.env,{NODE_ENV:'development',PORT:'4174',FRONTEND_STATIC_DIR:directory,SESSION_COOKIE_SECURE:'false',NOTIFICATION_WORKER_ENABLED:'false',APP_URL:'http://localhost:4174'});
 const pool=require('../src/config/database');
 const {assertSchemaReady}=require('../src/schemaReadiness');await assertSchemaReady(pool);
 const actual=(await pool.query('SELECT current_database() AS name')).rows[0].name;
 if(actual!==selected.database)throw new Error('Connected database is not the verified merged copy');
 fs.writeFileSync(stateFile,JSON.stringify({database:actual,build,enabled:false,reason:'Review existing Android queue before any business writes'},null,2));
 const enabled=()=>{try{const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));return state.enabled===true&&state.database===actual&&state.build===build;}catch{return false;}};
 const express=require('express'),app=express();
 app.get('/__samsung/runtime',(req,res)=>{res.set('Cache-Control','no-store');res.json({database:actual,source:'verified_merged_copy',build,deviceOrigin:'http://localhost:4174',hostPort:4174,businessWrites:enabled()?'ENABLED':'HELD_FOR_OFFLINE_REVIEW'});});
 app.use(writeGate({enabled}));app.use(require('../src/app'));
 const servers=[];
 try{for(const host of ['127.0.0.1','::1'])servers.push(await new Promise((resolve,reject)=>{const listener=app.listen(4174,host,()=>resolve(listener));listener.once('error',reject);}));}
 catch(error){for(const server of servers)server.close();await pool.end();throw error;}
 const runtime={checkedAt:new Date().toISOString(),database:actual,source:'verified_merged_copy',build,hostPort:4174,loopbackHosts:['127.0.0.1','::1'],deviceOrigin:'http://localhost:4174',pid:process.pid,businessWrites:'HELD_FOR_OFFLINE_REVIEW',automaticMigration:false,seeded:false};
 fs.writeFileSync(runtimeFile,JSON.stringify(runtime,null,2));fs.writeFileSync(path.join(root,'docs/integration/samsung-runtime.json'),JSON.stringify(runtime,null,2));console.log(JSON.stringify(runtime));
 const shutdown=()=>Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve)))).then(()=>pool.end()).then(()=>process.exit(0));process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={writeGate};
