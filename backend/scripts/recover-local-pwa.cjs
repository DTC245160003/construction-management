// Restore the existing local origin and ADB tunnel without opening the PWA,
// changing device storage, enabling writes, or upgrading any database.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn,execFile}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const HOLD='HELD_FOR_OFFLINE_REVIEW';

function privateEndpoint(value){
 const match=/^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/.exec(value || '');
 if(!match)return false;
 const parts=match[1].split('.'),octets=parts.map(Number),port=Number(match[2]);
 return parts.every((part,index)=>String(octets[index])===part&&octets[index]<=255)&&port>0&&port<=65535&&
  (octets[0]===10||octets[0]===192&&octets[1]===168||octets[0]===172&&octets[1]>=16&&octets[1]<=31);
}
function parseArgs(args){
 const options={windows:false};
 for(const arg of args){
  if(arg==='--windows'&&!options.windows)options.windows=true;
  else if(arg.startsWith('--serial=')&&!options.serial&&/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(arg.slice(9)))options.serial=arg.slice(9);
  else if(arg.startsWith('--connect=')&&!options.connect&&privateEndpoint(arg.slice(10)))options.connect=arg.slice(10);
  else throw new Error('Usage: pwa:recover [--windows] [--serial=CONNECTED_SERIAL] [--connect=PRIVATE_IPV4:PORT]');
 }
 return options;
}
function readExpected(directory=root,io=fs){
 const proof=JSON.parse(io.readFileSync(path.join(directory,'docs/integration/merged-copy.json'),'utf8'));
 if(!proof.restoreVerified||!proof.upgradeVerified||!proof.mergeVerified||!proof.sourceDatabasesUnchanged||proof.authority!=='construction_sprint45_demo'||
  !/^construction_merged_copy_\d+$/.test(proof.database)||proof.sourceDatabases?.includes(proof.database))throw new Error('A verified, preserved merged-copy proof is required.');
 const frontendDirectory=path.join(directory,'.tmp/samsung-pwa-dist'),worker=io.readFileSync(path.join(frontendDirectory,'journal-sw.js'));
 if(!io.existsSync(path.join(frontendDirectory,'index.html'))||worker.includes(Buffer.from('__XDS_BUILD__')))throw new Error('The existing versioned Samsung build is missing or incomplete; recovery will not rebuild it.');
 return {database:proof.database,build:crypto.createHash('sha256').update(worker).digest('hex'),frontendDirectory};
}
function runtimeProblem(runtime,expected){
 if(runtime?.source!=='verified_merged_copy'||runtime.database!==expected.database)return 'The occupied Samsung origin reports a different or unverified database.';
 if(runtime.deviceOrigin!=='http://localhost:4174'||runtime.hostPort!==4174)return 'The occupied service reports a different device origin.';
 if(runtime.build!==expected.build)return 'The live Samsung build differs from the prepared build; recovery will not replace it.';
 if(runtime.businessWrites!==HOLD)return 'Business writes are not held; recovery will not change the gate.';
 return null;
}
async function getJSON(url){
 try{
  const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(3000),redirect:'error'});
  return {status:response.status,data:await response.json().catch(()=>null)};
 }catch(error){
  return {error:error.cause?.code==='ECONNREFUSED'?'CONNECTION_REFUSED':'UNREACHABLE'};
 }
}
const healthy=response=>response.status===200&&response.data?.status==='ok'&&response.data.application?.status==='ok'&&response.data.database?.status==='ok';
async function probeSamsung(expected,httpGet){
 const runtime=await httpGet('http://127.0.0.1:4174/__samsung/runtime');
 if(runtime.error==='CONNECTION_REFUSED')return {status:'MISSING'};
 if(runtime.error||runtime.status!==200)return {status:'REFUSED',reason:'Port 4174 is occupied, unresponsive, or is not the Samsung runtime. No process was replaced.'};
 const problem=runtimeProblem(runtime.data,expected);
 if(problem)return {status:'REFUSED',reason:problem};
 if(!healthy(await httpGet('http://127.0.0.1:4174/health')))return {status:'REFUSED',reason:'Samsung runtime is present but its health check failed. No process was replaced.'};
 return {status:'PASS',origin:'http://localhost:4174',database:expected.database,build:expected.build,businessWrites:HOLD};
}
async function probeWindows(expected,httpGet){
 const health=await httpGet('http://127.0.0.1:3082/health');
 if(health.error==='CONNECTION_REFUSED')return {status:'MISSING'};
 if(!healthy(health))return {status:'REFUSED',reason:'Port 3082 is occupied or unhealthy. No process was replaced.'};
 const worker=await httpGet('http://127.0.0.1:3082/journal-sw.js',true);
 if(worker.status!==200||worker.sha256!==expected.build)return {status:'REFUSED',reason:'The live Windows build differs from the prepared Samsung build. No process was replaced.'};
 return {status:'PASS',origin:'http://localhost:3082',build:expected.build,databaseIdentity:'NOT_EXPOSED_BY_HEALTH_ENDPOINT'};
}
async function ensureHost(kind,expected,deps){
 const probe=()=>kind==='samsung'?probeSamsung(expected,deps.httpGet):probeWindows(expected,deps.httpGet);
 const initial=await probe();
 if(initial.status!=='MISSING')return {...initial,started:false};
 const started=await deps.startServer(kind,expected);
 for(let attempt=0;attempt<40;attempt++){
  const state=await probe();
  if(state.status!=='MISSING')return {...state,started:true,...started};
  await deps.delay(500);
 }
 return {status:'FAILED',started:true,...started,reason:'The launched server did not become healthy. Inspect its recovery logs.'};
}
function parseDevices(output){
 return output.split(/\r?\n/).flatMap(line=>{
  const match=/^(\S+)\s+(device|offline|unauthorized)(?:\s|$)/.exec(line.trim());
  return match?[{serial:match[1],state:match[2]}]:[];
 });
}
async function recoverDevice(options,runAdb){
 const partial=(reason,userAction)=>({status:'PARTIAL',reason,userAction,applicationNavigation:'NOT_PERFORMED'});
 try{
  if(options.connect)await runAdb(['connect',options.connect]);
  const devices=parseDevices(await runAdb(['devices','-l']));
  const connected=devices.filter(device=>device.state==='device'&&(!options.serial||device.serial===options.serial));
  if(!connected.length)return partial('No selected connected device is available.','Connect the already paired Note20 Ultra by USB or supply its current private wireless endpoint with --connect=IP:PORT; rerun with --serial=SERIAL.');
  const matching=[];
  for(const device of connected){
   if((await runAdb(['-s',device.serial,'shell','getprop','ro.product.model'])).trim()==='SM-N985F')matching.push(device);
  }
  if(matching.length!==1)return partial(matching.length?'More than one matching Note20 Ultra transport is connected.':'The selected device is not the expected SM-N985F.','Select one connected SM-N985F explicitly with --serial=SERIAL.');
  const serial=matching[0].serial;
  await runAdb(['-s',serial,'reverse','tcp:4174','tcp:4174']);
  const mapping=await runAdb(['-s',serial,'reverse','--list']);
  if(!mapping.split(/\r?\n/).some(line=>{const parts=line.trim().split(/\s+/);return parts.at(-2)==='tcp:4174'&&parts.at(-1)==='tcp:4174';}))return partial('ADB did not confirm the requested reverse mapping.','Keep the device connected and rerun recovery with its explicit serial.');
  return {status:'PASS',serial,model:'SM-N985F',reverse:'tcp:4174 tcp:4174',applicationNavigation:'NOT_PERFORMED',deviceHttpRequest:'NOT_PERFORMED'};
 }catch(error){
  return partial(error.code==='ENOENT'?'ADB executable was not found.':'ADB connection or reverse verification failed.','Check Android platform-tools and the already paired device connection; rerun recovery. No pairing or app changes were attempted.');
 }
}
async function recover(options,deps){
 const result={scope:'host_and_adb_reverse_configuration',samsung:await ensureHost('samsung',deps.expected,deps)};
 if(result.samsung.status!=='PASS')return {...result,status:result.samsung.status,device:{status:'NOT_ATTEMPTED'}};
 if(options.windows){
  result.windows=await ensureHost('windows',deps.expected,deps);
  if(result.windows.status!=='PASS')return {...result,status:result.windows.status,device:{status:'NOT_ATTEMPTED'}};
 }
 result.device=await recoverDevice(options,deps.runAdb);
 return {...result,status:result.device.status};
}
function serverPlan(kind,expected,directory=root){
 if(!['samsung','windows'].includes(kind))throw new Error('Unknown local launcher.');
 return {args:[path.join(directory,'backend/scripts',kind==='samsung'?'samsung-pwa.cjs':'start-verified-copy.cjs'),...(kind==='windows'?['--source=merged','--port=3082']:[])],
  options:{cwd:directory,detached:true,windowsHide:true},env:kind==='windows'?{FRONTEND_STATIC_DIR:expected.frontendDirectory}:{}};
}
function adbExecutable(env=process.env){
 const candidates=[env.ANDROID_SDK_ROOT&&path.join(env.ANDROID_SDK_ROOT,'platform-tools','adb.exe'),env.ANDROID_HOME&&path.join(env.ANDROID_HOME,'platform-tools','adb.exe'),env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'Android','Sdk','platform-tools','adb.exe')];
 return candidates.find(candidate=>candidate&&fs.existsSync(candidate))||'adb';
}
async function startServer(kind,expected,directory=root){
 const logs=path.join(directory,'.private/integration/connectivity');fs.mkdirSync(logs,{recursive:true});
 const stamp=new Date().toISOString().replace(/[:.]/g,'-'),stdout=path.join(logs,`${stamp}-${kind}.stdout.log`),stderr=path.join(logs,`${stamp}-${kind}.stderr.log`);
 const output=fs.openSync(stdout,'a'),errors=fs.openSync(stderr,'a');
 const plan=serverPlan(kind,expected,directory);
 try{
  const child=spawn(process.execPath,plan.args,{...plan.options,stdio:['ignore',output,errors],env:{...process.env,...plan.env}});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
  return {pid:child.pid,logs:{stdout,stderr}};
 }finally{fs.closeSync(output);fs.closeSync(errors);}
}
async function main(args=process.argv.slice(2)){
 const options=parseArgs(args),expected=readExpected(),adb=adbExecutable();
 const deps={expected,startServer,httpGet:async(url,hash)=>{
  if(!hash)return getJSON(url);
  try{const response=await fetch(url,{signal:AbortSignal.timeout(3000),redirect:'error'});return {status:response.status,sha256:crypto.createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')};}catch{return {error:'UNREACHABLE'};}
 },delay:ms=>new Promise(resolve=>setTimeout(resolve,ms)),runAdb:args=>new Promise((resolve,reject)=>execFile(adb,args,{timeout:10000,windowsHide:true,maxBuffer:128*1024},(error,stdout)=>error?reject(error):resolve(stdout)))};
 const result={checkedAt:new Date().toISOString(),...await recover(options,deps)};
 const logs=path.join(root,'.private/integration/connectivity');fs.mkdirSync(logs,{recursive:true});
 fs.writeFileSync(path.join(logs,'latest-recovery.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
 process.exitCode=result.status==='PASS'?0:result.status==='PARTIAL'?2:1;
 return result;
}
if(require.main===module)main().catch(()=>{console.error(JSON.stringify({status:'FAILED',reason:'Recovery could not validate its prerequisites or start a server. Check the verified-copy proof, prepared build, and recovery logs. No process was replaced.'}));process.exitCode=1;});
module.exports={privateEndpoint,parseArgs,readExpected,runtimeProblem,probeSamsung,probeWindows,parseDevices,recoverDevice,recover,serverPlan,main};
