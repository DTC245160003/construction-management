const {verifiedCopyConfig}=require('../scripts/start-verified-copy.cjs');
const config={connectionString:'postgresql://fixture:placeholder@localhost/original?sslmode=require'};
test('verified startup preserves the configured server/TLS but targets only the explicit upgraded copy',()=>{
 const selected=verifiedCopyConfig(['--source=sprint45','--port=3081'],{cloneDatabase:'construction_legacy45_restore_test_1234',restoreVerified:true,upgradeVerified:true,sourceDatabase:'construction_sprint45_demo'},config);
 expect(selected.database).toBe('construction_legacy45_restore_test_1234');expect(new URL(selected.connection.connectionString).searchParams.get('sslmode')).toBe('require');expect(new URL(config.connectionString).pathname).toBe('/original');
});
test('verified startup rejects source databases, unverified copies and invalid source/port',()=>{
 const proof={cloneDatabase:'construction_restore_test_1234',restoreVerified:true,upgradeVerified:true,originalDatabase:'original'};
 expect(()=>verifiedCopyConfig(['--source=original'],{...proof,cloneDatabase:'original'},config)).toThrow('Refusing');
 expect(()=>verifiedCopyConfig(['--source=original'],{...proof,upgradeVerified:false},config)).toThrow('Refusing');
 expect(()=>verifiedCopyConfig(['--source=production'],proof,config)).toThrow('Choose');
 expect(()=>verifiedCopyConfig(['--source=original','--port=80'],proof,config)).toThrow('Choose');
});
test('merged startup requires successful reconciliation and never accepts a source database',()=>{
 const proof={database:'construction_merged_copy_1234',restoreVerified:true,upgradeVerified:true,mergeVerified:true,authority:'construction_sprint45_demo',sourceDatabasesUnchanged:true,sourceDatabases:['construction_management','construction_sprint45_demo']};
 expect(verifiedCopyConfig(['--source=merged'],proof,config).port).toBe(3082);
 expect(()=>verifiedCopyConfig(['--source=merged'],{...proof,mergeVerified:false},config)).toThrow('Refusing');
 expect(()=>verifiedCopyConfig(['--source=merged'],{...proof,database:'construction_management'},config)).toThrow('Refusing');
});
