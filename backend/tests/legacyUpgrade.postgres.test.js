const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {randomUUID}=require('node:crypto');
const {Pool}=require('pg');
const request=require('supertest');
const {runMigrations}=require('../src/run-migration');
const {hashPassword}=require('../src/config/password');
const {operationsApp}=require('./helpers/operationsApp');
const {LEGACY_INVITATION_CHECKSUM}=require('../src/migrationCompatibility');
const describePostgres=process.env.SPRINT2_TEST_DATABASE_URL?describe:describe.skip;

describePostgres('Upgrade of the verified pre-Sprint-6 legacy schema',()=>{
    let admin,pool,schema,directory,store;
    const source=path.join(__dirname,'../src/migrations');
    beforeEach(async()=>{
        schema=`legacy_upgrade_${randomUUID().replaceAll('-','')}`;
        admin=new Pool({connectionString:process.env.SPRINT2_TEST_DATABASE_URL});
        await admin.query(`CREATE SCHEMA "${schema}"`);
        pool=new Pool({connectionString:process.env.SPRINT2_TEST_DATABASE_URL,options:`-c search_path=${schema}`});
        directory=fs.mkdtempSync(path.join(os.tmpdir(),'verified-legacy014-'));
        for(const name of fs.readdirSync(source).filter(name=>/^\d{3}_[a-z0-9_]+\.sql$/.test(name)&&name<'015'))fs.copyFileSync(path.join(source,name),path.join(directory,name));
        fs.copyFileSync(path.join(source,'archive/014_create_project_invitations_legacy.sql'),path.join(directory,'014_create_project_invitations.sql'));
        const client=await pool.connect();try{await runMigrations({client,directory});}finally{client.release();}
    });
    afterEach(async()=>{
        if(store){await store.close();store=null;}
        if(pool)await pool.end();
        // Only this suite's generated UUID schema; never a database or public.
        if(admin){if(/^legacy_upgrade_[a-f0-9]{32}$/.test(schema))await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}
        if(directory&&path.dirname(directory)===path.resolve(os.tmpdir())&&path.basename(directory).startsWith('verified-legacy014-'))fs.rmSync(directory,{recursive:true,force:true});
    });
    const migrate=async()=>{const client=await pool.connect();try{return await runMigrations({client});}finally{client.release();}};
    test('old columns, password hash, role, membership, invitation and historical checksum survive the upgrade; real legacy fixture login works',async()=>{
        // Known credentials belong only to this isolated fixture, not real users.
        const password='Legacy-fixture-only-493!',hash=await hashPassword(password);
        const role=(await pool.query("INSERT INTO roles(name) VALUES('project_manager') RETURNING id")).rows[0].id;
        const actor=(await pool.query("INSERT INTO users(username,fullname,email,password_hash,role_id) VALUES('legacy-fixture','Old fixture','old@legacy.test',$1,$2) RETURNING id",[hash,role])).rows[0].id;
        const project=(await pool.query("INSERT INTO projects(name) VALUES('Existing project') RETURNING id")).rows[0].id;
        await pool.query('INSERT INTO project_members(project_id,user_id,role_id) VALUES($1,$2,$3)',[project,actor,role]);
        const item=(await pool.query("INSERT INTO work_items(project_id,title) VALUES($1,'Existing item') RETURNING id",[project])).rows[0].id;
        await pool.query("INSERT INTO tasks(work_item_id,name,duration_days) VALUES($1,'Existing task',3)",[item]);
        await pool.query("INSERT INTO project_invitations(project_id,email,role_id,invited_by) VALUES($1,'invited@legacy.test',$2,$3)",[project,role,actor]);
        const tables=['users','roles','projects','work_items','tasks','project_members','project_invitations','schema_migrations'];
        const before={};for(const table of tables)before[table]=(await pool.query(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows.map(row=>row.row);
        expect(before.schema_migrations.find(row=>row.name==='014_create_project_invitations.sql').checksum).toBe(LEGACY_INVITATION_CHECKSUM);
        const messages=await migrate();expect(messages).toContain('Applied: 017_sprint4_5.sql');expect(messages).toContain('Applied: 021_sprint6_8_financial_integrity.sql');
        for(const table of tables){
            const columns=Object.keys(before[table][0]).map(name=>'"'+name+'"').join(',');
            const after=(await pool.query(`SELECT to_jsonb(t) AS row FROM (SELECT ${columns} FROM "${table}") t ORDER BY to_jsonb(t)::text`)).rows.map(row=>row.row);
            if(table==='schema_migrations')expect(after.filter(row=>before[table].some(old=>old.name===row.name))).toEqual(before[table]);else expect(after).toEqual(before[table]);
        }
        expect((await pool.query('SELECT system_role,is_active FROM users WHERE id=$1',[actor])).rows[0]).toEqual({system_role:'user',is_active:true});
        expect((await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='project_invitations' AND column_name IN ('token_hash','expires_at')",[schema])).rowCount).toBe(2);
        const fixture=operationsApp(pool);store=fixture.store;const agent=request.agent(fixture.app);
        await agent.post('/auth/login').send({email:'old@legacy.test',password}).expect(200);
        await agent.get(`/projects/${project}/overview`).expect(200);
        await agent.get(`/projects/${project}/acceptance`).expect(200);
        await agent.get(`/projects/${project}/payments`).expect(200);
        expect((await pool.query('SELECT password_hash,role_id FROM users WHERE id=$1',[actor])).rows[0]).toEqual({password_hash:hash,role_id:role});
        expect(await migrate()).toEqual(['No pending migrations.']);
    });
    test('an unknown legacy checksum fails before any upgrade and never rewrites recorded history',async()=>{
        await pool.query("UPDATE schema_migrations SET checksum=$1 WHERE name='014_create_project_invitations.sql'",['0'.repeat(64)]);
        const before=(await pool.query('SELECT * FROM schema_migrations ORDER BY name')).rows;
        await expect(migrate()).rejects.toThrow('Applied migration has changed');
        expect((await pool.query('SELECT * FROM schema_migrations ORDER BY name')).rows).toEqual(before);
        expect((await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='users' AND column_name='system_role'",[schema])).rowCount).toBe(0);
    });
});
