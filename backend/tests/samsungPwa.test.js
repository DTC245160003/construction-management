const express=require('express'),request=require('supertest');
const {writeGate}=require('../scripts/samsung-pwa.cjs');
test('Samsung review gate permits login and reads, and retains queued business writes with 503',async()=>{
 const app=express();app.use(writeGate());app.use((req,res)=>res.json({ok:true}));
 await request(app).get('/projects').expect(200);
 await request(app).post('/auth/login').expect(200);
 await request(app).post('/auth/logout').expect(200);
 for(const route of ['/projects/1/journals/sync','/projects/1/photos','/projects/1/payments']){
  const r=await request(app).post(route).expect(503);expect(r.body.code).toBe('SAMSUNG_SYNC_REVIEW_HOLD');
 }
 await request(app).patch('/admin/users/2').expect(503);
});
test('Samsung review gate opens only when its verified runtime control enables writes',async()=>{
 let reviewed=false;const app=express();app.use(writeGate({enabled:()=>reviewed}));app.post('/projects/1/journals/sync',(req,res)=>res.json({ok:true}));
 await request(app).post('/projects/1/journals/sync').expect(503);reviewed=true;
 await request(app).post('/projects/1/journals/sync').expect(200);
});
