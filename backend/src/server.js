require('./config/environment').loadEnvironment();

const app = require("./app");
const { startNotificationWorker } = require("./services/notificationWorker");
const {assertSchemaReady}=require('./schemaReadiness');
const {defaultDirectory}=require('./middleware/frontendHosting');
const fs=require('node:fs'),path=require('node:path');

const PORT = process.env.PORT || 3000;

async function main(){
    const pool=require('./config/database');
    try{
        if(process.env.API_ONLY!=='1'&&!fs.existsSync(path.join(process.env.FRONTEND_STATIC_DIR||defaultDirectory,'index.html')))throw new Error('Frontend build is missing. Run npm run build at the repository root, or set API_ONLY=1 for an API-only development server.');
        await assertSchemaReady(pool);
        const server=await new Promise((resolve,reject)=>{const listening=app.listen(PORT,'0.0.0.0',()=>resolve(listening));listening.once('error',reject);});
        console.log(JSON.stringify({event:'server_started',port:Number(PORT),frontend:process.env.API_ONLY!=='1'}));
        const stopWorker=process.env.NOTIFICATION_WORKER_ENABLED==='false'?()=>{}:startNotificationWorker(pool);
        const shutdown=()=>{stopWorker();server.close(()=>pool.end().then(()=>process.exit(0)));setTimeout(()=>process.exit(1),10000).unref();};
        process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
    }catch(error){await pool.end();throw error;}
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({event:'startup_failed',message:error.message}));process.exitCode=1;});
module.exports={main};
