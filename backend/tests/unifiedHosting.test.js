const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const express=require('express'),request=require('supertest');
const {createFrontendHosting}=require('../src/middleware/frontendHosting');
const {createCorsMiddleware,configuredOrigins}=require('../src/middleware/cors');
const {createDatabaseConfig}=require('../src/config/databaseConfig');
const {databaseName,targetDatabase,libpqEnvironment}=require('../src/config/databaseTarget');

test('DATABASE_URL and legacy DB fields use one configuration without leaking invalid credentials',()=>{
    expect(createDatabaseConfig({DB_HOST:'localhost',DB_NAME:'original',DB_USER:'user',DB_PASSWORD:'private'})).toMatchObject({host:'localhost',database:'original',password:'private',max:10});
    expect(createDatabaseConfig({DATABASE_URL:'postgresql://account:private@db.example/original?sslmode=verify-full',DB_NAME:'ignored'})).toEqual({max:10,connectionTimeoutMillis:5000,connectionString:'postgresql://account:private@db.example/original?sslmode=verify-full'});
    expect(()=>createDatabaseConfig({DATABASE_URL:'private-password-not-a-url'})).toThrow('DATABASE_URL must be a valid PostgreSQL connection URL.');
    expect(()=>createDatabaseConfig({DB_POOL_MAX:'0'})).toThrow('DB_POOL_MAX');
});
test('configured HTTPS CORS supports PUT, exact origins and credentialed preflight',async()=>{
    const app=express();app.use(createCorsMiddleware({origins:configuredOrigins({CORS_ORIGINS:'https://xds.example,https://review.example'})}));app.put('/contracts',(req,res)=>res.json({ok:true}));
    const allowed=await request(app).options('/contracts').set('Origin','https://xds.example').expect(204);
    expect(allowed.headers['access-control-allow-methods']).toContain('PUT');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    await request(app).options('/contracts').set('Origin','https://xds.example.attacker.test').expect(403);
    expect(()=>configuredOrigins({CORS_ORIGINS:'https://private:secret@example.test'})).toThrow(/without credentials/);
});
test('backup and restored-copy tools use the same URL credentials and SSL settings as the application',()=>{
    const base=createDatabaseConfig({DATABASE_URL:'postgresql://owner:p%40ss@db.example:5433/original?sslmode=verify-full'});
    expect(databaseName(base)).toBe('original');
    const copy=targetDatabase(base,'restored_test');expect(databaseName(copy)).toBe('restored_test');
    expect(libpqEnvironment(copy,{})).toMatchObject({PGHOST:'db.example',PGPORT:'5433',PGUSER:'owner',PGPASSWORD:'p@ss',PGDATABASE:'restored_test',PGSSLMODE:'verify-full'});
    expect(databaseName(base)).toBe('original');
});
describe('one HTTP origin serves React routes and keeps API/files isolated',()=>{
    let folder,app;
    beforeAll(()=>{
        folder=fs.mkdtempSync(path.join(os.tmpdir(),'xds-hosting-'));fs.mkdirSync(path.join(folder,'assets'));
        fs.writeFileSync(path.join(folder,'index.html'),'<html>UNIFIED-REACT</html>');
        fs.writeFileSync(path.join(folder,'assets/app-12345678.js'),'window.ready=true;');fs.writeFileSync(path.join(folder,'.env'),'PRIVATE');
        app=express();app.use(createFrontendHosting({directory:folder}));app.get('/projects',(req,res)=>res.status(401).json({message:'Login required'}));app.use((req,res)=>res.status(404).json({message:'Not found'}));
    });
    afterAll(()=>{if(!path.resolve(folder).startsWith(path.resolve(os.tmpdir())+path.sep))throw new Error('Unexpected fixture directory');fs.rmSync(folder,{recursive:true,force:true});});
    test.each(['/','/login','/projects','/acceptance?projectId=234','/payments?projectId=57','/reports?projectId=810'])('HTML navigation %s serves the same React shell',async url=>{
        const r=await request(app).get(url).set('Accept','text/html').expect(200);expect(r.text).toContain('UNIFIED-REACT');expect(r.headers['cache-control']).toBe('no-cache');
    });
    test('JSON requests remain authenticated APIs, and missing modules cannot become HTML',async()=>{
        await request(app).get('/projects').set('Accept','application/json').expect(401);
        for(const url of ['/auth/missing','/api/v1/missing','/projects/234/payments','/assets/missing.js','/.env']){
            const r=await request(app).get(url).set('Accept','text/html').expect(404);expect(r.text).not.toContain('UNIFIED-REACT');expect(r.text).not.toContain('PRIVATE');
        }
        const asset=await request(app).get('/assets/app-12345678.js').expect(200);expect(asset.headers['cache-control']).toContain('immutable');
    });
});
