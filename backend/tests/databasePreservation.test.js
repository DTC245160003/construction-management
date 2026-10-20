const {compareSnapshots,assertFreeSpace}=require('../scripts/restore-upgrade-copy.cjs');
const fs=require('node:fs');
afterEach(()=>jest.restoreAllMocks());
test('preservation verifier refuses changed old hashes, deleted users or rewritten migration history',()=>{
    const before={counts:{users:4,projects:2,user_sessions:1,schema_migrations:14},fingerprints:{users:'old-credentials',projects:'old-projects'},history:[{name:'014.sql',checksum:'legacy'}]};
    const upgraded={...before,counts:{...before.counts,user_sessions:0,schema_migrations:22},history:[...before.history,{name:'021.sql',checksum:'new'}]};
    expect(compareSnapshots(before,upgraded)).toMatchObject({users:4,oldMigrationRecords:1,originalColumnsUnchanged:true});
    expect(()=>compareSnapshots(before,{...upgraded,fingerprints:{...before.fingerprints,users:'new-password'}})).toThrow('original column data differs');
    expect(()=>compareSnapshots(before,{...upgraded,counts:{...upgraded.counts,users:3}})).toThrow('row count differs');
    expect(()=>compareSnapshots(before,{...upgraded,history:[{name:'014.sql',checksum:'rewritten'}]})).toThrow('recorded history differs');
});
test('less than 2 GiB free stops the rehearsal before database access',()=>{
    jest.spyOn(fs,'statfsSync').mockReturnValue({bavail:100n,bsize:4096n});
    expect(()=>assertFreeSpace('test-data-volume')).toThrow('No database connection or write was attempted');
});
