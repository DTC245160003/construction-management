const path=require('node:path'),crypto=require('node:crypto');
const {parseArgs,privateEndpoint,readExpected,runtimeProblem,recoverDevice,recover,serverPlan}=require('../scripts/recover-local-pwa.cjs');
const expected={database:'construction_merged_copy_1234',build:'a'.repeat(64),frontendDirectory:path.resolve('fixture/.tmp/samsung-pwa-dist')};
const runtime={source:'verified_merged_copy',database:expected.database,build:expected.build,deviceOrigin:'http://localhost:4174',hostPort:4174,businessWrites:'HELD_FOR_OFFLINE_REVIEW'};
const health={status:200,data:{status:'ok',application:{status:'ok'},database:{status:'ok'}}};

function dependencies(){
 return {expected,delay:jest.fn().mockResolvedValue(),startServer:jest.fn().mockResolvedValue({pid:123,logs:{stdout:'private.stdout.log',stderr:'private.stderr.log'}}),
  httpGet:jest.fn(async(url,hash)=>url.endsWith('/__samsung/runtime')?{status:200,data:runtime}:hash?{status:200,sha256:expected.build}:health),
  runAdb:jest.fn(async args=>{
   if(args[0]==='devices')return 'List of devices attached\nfixture-usb device product:c2s model:SM_N985F\n';
   if(args.includes('getprop'))return 'SM-N985F\n';
   if(args.includes('--list'))return 'UsbFfs tcp:4174 tcp:4174\n';
   return '';
  })};
}
const reverseCalls=run=>run.mock.calls.filter(([args])=>args.includes('reverse'));

test('recovery arguments accept only explicit private wireless endpoints and safe serial values',()=>{
 expect(parseArgs(['--windows','--serial=192.168.2.32:42265','--connect=192.168.2.32:42265'])).toEqual({windows:true,serial:'192.168.2.32:42265',connect:'192.168.2.32:42265'});
 for(const value of ['10.2.3.4:5555','172.16.0.1:5555','172.31.255.2:65535'])expect(privateEndpoint(value)).toBe(true);
 for(const value of ['8.8.8.8:5555','127.0.0.1:5555','172.32.0.1:5555','192.168.2.300:5555','192.168.02.1:5555','192.168.2.1:0','192.168.2.1:65536','192.168.2.1:5555;reset'])expect(()=>parseArgs([`--connect=${value}`])).toThrow('Usage');
 for(const value of ['--enable-sync','--pair=123456','--serial=usb;reset','--windows=true'])expect(()=>parseArgs([value])).toThrow('Usage');
});

test('recovery reads only an already verified merged proof and versioned prepared build',()=>{
 const proof={database:expected.database,restoreVerified:true,upgradeVerified:true,mergeVerified:true,sourceDatabasesUnchanged:true,authority:'construction_sprint45_demo',sourceDatabases:['original']};
 const worker=Buffer.from('const CACHE="versioned-existing-build";');
 const io={readFileSync:jest.fn(file=>file.endsWith('.json')?JSON.stringify(proof):worker),existsSync:jest.fn(()=>true)};
 expect(readExpected(path.resolve('fixture'),io)).toEqual({...expected,build:crypto.createHash('sha256').update(worker).digest('hex')});
 proof.database='original'; expect(()=>readExpected(path.resolve('fixture'),io)).toThrow('verified');
 proof.database=expected.database; proof.sourceDatabasesUnchanged=false; expect(()=>readExpected(path.resolve('fixture'),io)).toThrow('verified');
 proof.sourceDatabasesUnchanged=true; io.readFileSync.mockImplementation(file=>file.endsWith('.json')?JSON.stringify(proof):Buffer.from('__XDS_BUILD__'));
 expect(()=>readExpected(path.resolve('fixture'),io)).toThrow('will not rebuild');
});

test.each([
 ['database','construction_management'],['source','unverified'],['build','different'],['deviceOrigin','http://localhost:5173'],['hostPort',3000],['businessWrites','ENABLED']
])('an occupied Samsung service with wrong %s is refused without a launch or device action',async(key,value)=>{
 const deps=dependencies(); deps.httpGet.mockResolvedValue({status:200,data:{...runtime,[key]:value}});
 const result=await recover({},deps);
 expect(result.status).toBe('REFUSED'); expect(result.device.status).toBe('NOT_ATTEMPTED');
 expect(deps.startServer).not.toHaveBeenCalled(); expect(deps.runAdb).not.toHaveBeenCalled();
 expect(runtimeProblem({...runtime,[key]:value},expected)).toBeTruthy();
});

test('a healthy laptop with no connected device reports PARTIAL and preserves host PASS',async()=>{
 const deps=dependencies(); deps.runAdb.mockResolvedValue('List of devices attached\nfixture-usb offline\n');
 const result=await recover({},deps);
 expect(result.status).toBe('PARTIAL'); expect(result.samsung).toMatchObject({status:'PASS',started:false,businessWrites:'HELD_FOR_OFFLINE_REVIEW'});
 expect(result.device.userAction).toContain('--connect=IP:PORT'); expect(deps.startServer).not.toHaveBeenCalled(); expect(reverseCalls(deps.runAdb)).toEqual([]);
});

test('only a missing Samsung listener starts its existing launcher and waits for live health',async()=>{
 const deps=dependencies(),live=deps.httpGet.getMockImplementation(); let probes=0;
 deps.httpGet.mockImplementation(async(...args)=>args[0].endsWith('/__samsung/runtime')&&probes++<2?{error:'CONNECTION_REFUSED'}:live(...args));
 const result=await recover({},deps);
 expect(result.status).toBe('PASS'); expect(result.samsung).toMatchObject({status:'PASS',started:true,pid:123});
 expect(deps.startServer).toHaveBeenCalledTimes(1); expect(deps.startServer).toHaveBeenCalledWith('samsung',expected);
 expect(deps.delay).toHaveBeenCalledWith(500);
});

test.each([{status:404,data:null},{error:'UNREACHABLE'}])('an unknown or unresponsive occupied port is never restarted: %j',async(response)=>{
 const deps=dependencies(); deps.httpGet.mockResolvedValue(response);
 expect((await recover({},deps)).status).toBe('REFUSED'); expect(deps.startServer).not.toHaveBeenCalled(); expect(deps.runAdb).not.toHaveBeenCalled();
});

test('a live Samsung runtime with unavailable database health is preserved and diagnosed',async()=>{
 const deps=dependencies(),live=deps.httpGet.getMockImplementation();
 deps.httpGet.mockImplementation((url,...args)=>url.endsWith('/health')?{status:503,data:{status:'degraded'}}:live(url,...args));
 const result=await recover({},deps); expect(result.status).toBe('REFUSED'); expect(result.samsung.reason).toContain('health'); expect(deps.startServer).not.toHaveBeenCalled();
});

test('a server which never opens its port produces a bounded failure with logs and no ADB calls',async()=>{
 const deps=dependencies(); deps.httpGet.mockResolvedValue({error:'CONNECTION_REFUSED'});
 const result=await recover({},deps);
 expect(result.status).toBe('FAILED'); expect(result.samsung.logs.stderr).toBe('private.stderr.log');
 expect(deps.startServer).toHaveBeenCalledTimes(1); expect(deps.delay).toHaveBeenCalledTimes(40); expect(deps.runAdb).not.toHaveBeenCalled();
});

test('explicit serial verifies only the selected SM-N985F before changing its reverse mapping',async()=>{
 const deps=dependencies(),normal=deps.runAdb.getMockImplementation();
 deps.runAdb.mockImplementation(args=>args[0]==='devices'?'List of devices attached\nother device\nfixture-usb device\n':normal(args));
 const result=await recoverDevice({serial:'fixture-usb'},deps.runAdb);
 expect(result).toMatchObject({status:'PASS',serial:'fixture-usb',model:'SM-N985F',reverse:'tcp:4174 tcp:4174',applicationNavigation:'NOT_PERFORMED'});
 expect(deps.runAdb.mock.calls.slice(1).every(([args])=>args[0]==='-s'&&args[1]==='fixture-usb')).toBe(true);
 expect(reverseCalls(deps.runAdb).map(([args])=>args.slice(2))).toEqual([['reverse','tcp:4174','tcp:4174'],['reverse','--list']]);
});

test('automatic selection refuses ambiguous matching transports without replacing a tunnel',async()=>{
 const deps=dependencies(),normal=deps.runAdb.getMockImplementation();
 deps.runAdb.mockImplementation(args=>args[0]==='devices'?'List of devices attached\nusb device\n192.168.2.32:5555 device\n':normal(args));
 const result=await recoverDevice({},deps.runAdb);
 expect(result.status).toBe('PARTIAL'); expect(result.reason).toContain('More than one'); expect(reverseCalls(deps.runAdb)).toEqual([]);
});

test('a wrong model or unauthorized explicit serial cannot receive a reverse mapping',async()=>{
 const deps=dependencies(),normal=deps.runAdb.getMockImplementation();
 deps.runAdb.mockImplementation(args=>args.includes('getprop')?'SM-OTHER':normal(args));
 expect((await recoverDevice({serial:'fixture-usb'},deps.runAdb)).status).toBe('PARTIAL');
 expect((await recoverDevice({serial:'unauthorized-device'},deps.runAdb)).status).toBe('PARTIAL'); expect(reverseCalls(deps.runAdb)).toEqual([]);
});

test('an owner-provided endpoint connects without pairing and a missing mapping never reports PASS',async()=>{
 const deps=dependencies(),normal=deps.runAdb.getMockImplementation();
 deps.runAdb.mockImplementation(args=>args.includes('--list')?'UsbFfs tcp:3000 tcp:3000':normal(args));
 const result=await recoverDevice(parseArgs(['--connect=192.168.2.32:42265']),deps.runAdb);
 expect(deps.runAdb.mock.calls[0][0]).toEqual(['connect','192.168.2.32:42265']); expect(result.status).toBe('PARTIAL');
 for(const forbidden of ['pair','install','uninstall','am','clear','--enable-sync'])expect(deps.runAdb.mock.calls.flat(2)).not.toContain(forbidden);
});

test('missing platform-tools produces an actionable partial result with the laptop still healthy',async()=>{
 const deps=dependencies(); deps.runAdb.mockRejectedValue(Object.assign(new Error('missing'),{code:'ENOENT'}));
 const result=await recover({},deps);
 expect(result.status).toBe('PARTIAL'); expect(result.samsung.status).toBe('PASS'); expect(result.device.reason).toContain('ADB executable');
});

test('optional Windows recovery starts only a missing listener and shares the prepared build',async()=>{
 const deps=dependencies(),live=deps.httpGet.getMockImplementation(); let probes=0;
 deps.httpGet.mockImplementation((url,...args)=>url.includes(':3082/health')&&probes++===0?{error:'CONNECTION_REFUSED'}:live(url,...args));
 const result=await recover({windows:true},deps);
 expect(result.windows).toMatchObject({status:'PASS',started:true,databaseIdentity:'NOT_EXPOSED_BY_HEALTH_ENDPOINT'});
 expect(deps.startServer).toHaveBeenCalledTimes(1); expect(deps.startServer).toHaveBeenCalledWith('windows',expected);
 const plan=serverPlan('windows',expected,path.resolve('fixture'));
 expect(plan.args).toEqual([path.resolve('fixture/backend/scripts/start-verified-copy.cjs'),'--source=merged','--port=3082']);
 expect(plan.env).toEqual({FRONTEND_STATIC_DIR:expected.frontendDirectory}); expect(plan.options).toMatchObject({detached:true,windowsHide:true});
 const samsung=serverPlan('samsung',expected,path.resolve('fixture'));
 expect(samsung.args).toEqual([path.resolve('fixture/backend/scripts/samsung-pwa.cjs')]); expect(samsung.env).toEqual({});
 expect(()=>serverPlan('other',expected)).toThrow('Unknown');
});

test('an existing Windows service with another build is preserved without starting or contacting a device',async()=>{
 const deps=dependencies(),live=deps.httpGet.getMockImplementation();
 deps.httpGet.mockImplementation((url,hash)=>hash?{status:200,sha256:'different'}:live(url,hash));
 const result=await recover({windows:true},deps);
 expect(result.samsung.status).toBe('PASS'); expect(result.windows.status).toBe('REFUSED'); expect(deps.startServer).not.toHaveBeenCalled(); expect(deps.runAdb).not.toHaveBeenCalled();
});
