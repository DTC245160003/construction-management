// Test fixture reuses the real app and frontend hosting. It never authenticates
// an account, connects to PostgreSQL, migrates or seeds data.
if(process.env.UNIFIED_SHELL_E2E!=='1')throw new Error('This server is only for the no-database shell E2E suite.');
const session=require('express-session');
const {createApp}=require('../src/app');
const app=createApp({authService:{getCurrentUser:async()=>null},sessionStore:new session.MemoryStore(),sessionSecret:'isolated-shell-test-secret-with-32-bytes',secureCookies:false,healthPool:{query:async()=>{throw new Error('Database is intentionally unavailable in this shell test');}}});
app.listen(3089,'127.0.0.1',()=>console.log('Unified shell test on 127.0.0.1:3089; no database access.'));
