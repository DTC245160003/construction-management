const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {verifiedLegacyHistory,LEGACY_INVITATION_CHECKSUM}=require('../src/migrationCompatibility');
const hash=sql=>createHash('sha256').update(sql).digest('hex');
const sql=fs.readFileSync(path.join(__dirname,'../src/migrations/014_create_project_invitations.sql'),'utf8').replaceAll('\r\n','\n');
const migrations=[{name:'014_create_project_invitations.sql',sql,checksum:hash(sql)}];
const columns=Object.entries({id:'integer',project_id:'integer',email:'character varying',role_id:'integer',invited_by:'integer',status:'character varying',accepted_by:'integer',accepted_at:'timestamp with time zone',created_at:'timestamp with time zone',updated_at:'timestamp with time zone'}).map(([column_name,data_type])=>({table_name:'project_invitations',column_name,data_type})).concat({table_name:'users',column_name:'last_login_at',data_type:'timestamp with time zone'});
test('verified legacy 014 differs only in trailing whitespace and its recorded checksum remains immutable',async()=>{
    const archived=fs.readFileSync(path.join(__dirname,'../src/migrations/archive/014_create_project_invitations_legacy.sql'),'utf8').replaceAll('\r\n','\n');
    expect(hash(archived)).toBe(LEGACY_INVITATION_CHECKSUM);expect(sql.trimEnd()).toBe(archived.trimEnd());
    const applied=[{name:migrations[0].name,checksum:LEGACY_INVITATION_CHECKSUM}];
    const client={query:jest.fn(async()=>({rows:columns}))};
    const validated=await verifiedLegacyHistory(client,migrations,applied);
    expect(validated[0].checksum).toBe(migrations[0].checksum);expect(applied[0].checksum).toBe(LEGACY_INVITATION_CHECKSUM);
    expect(client.query).toHaveBeenCalledTimes(1);expect(client.query.mock.calls[0][0]).toMatch(/^SELECT/);
});
test('unknown checksum is left for the standard fail-closed history guard',async()=>{
    const applied=[{name:migrations[0].name,checksum:'unknown'}],client={query:jest.fn()};
    expect(await verifiedLegacyHistory(client,migrations,applied)).toBe(applied);expect(client.query).not.toHaveBeenCalled();
});
test('known checksum with a mismatching schema or altered canonical source is refused',async()=>{
    const applied=[{name:migrations[0].name,checksum:LEGACY_INVITATION_CHECKSUM}];
    await expect(verifiedLegacyHistory({query:async()=>({rows:[]})},migrations,applied)).rejects.toThrow('schema cannot be verified');
    await expect(verifiedLegacyHistory({query:jest.fn()},[{...migrations[0],sql:sql+'SELECT 1;'}],applied)).rejects.toThrow('source cannot be verified');
});
