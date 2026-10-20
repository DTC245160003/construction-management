jest.mock('pg',()=>({Pool:jest.fn()}));
jest.mock('../scripts/restore-upgrade-copy.cjs',()=>({assertFreeSpace:jest.fn()}));
const {Pool}=require('pg');
const {assertFreeSpace}=require('../scripts/restore-upgrade-copy.cjs');
const {testDatabase}=require('../scripts/test-sprint68.cjs');
let originalEnv;
beforeEach(()=>{originalEnv={...process.env};jest.clearAllMocks();delete process.env.SPRINT2_TEST_DATABASE_URL;process.env.DATABASE_URL='postgresql://fixture:placeholder@localhost/original';});
afterEach(()=>{process.env=originalEnv;assertFreeSpace.mockReset();});
test('DATABASE_URL takes precedence over DB_NAME when preventing tests against the original',async()=>{
    process.env.DB_NAME='different';process.env.DATABASE_URL='postgresql://fixture:placeholder@localhost/construction_sprint68_test';
    await expect(testDatabase()).rejects.toThrow('must differ');expect(Pool).not.toHaveBeenCalled();
});
test('test target preserves configured server and TLS parameters without changing the original',async()=>{
    process.env.DATABASE_URL='postgresql://fixture:placeholder@database.example:6543/original?sslmode=verify-full';
    const query=jest.fn(async()=>({rowCount:1})),end=jest.fn();Pool.mockImplementation(()=>({query,end}));
    const url=new URL(await testDatabase());expect(url.hostname).toBe('database.example');expect(url.pathname).toBe('/construction_sprint68_test');expect(url.searchParams.get('sslmode')).toBe('verify-full');
    expect(Pool.mock.calls[0][0].connectionString).toContain('/postgres?sslmode=verify-full');expect(query).toHaveBeenCalledTimes(1);expect(end).toHaveBeenCalled();
    expect(new URL(process.env.DATABASE_URL).pathname).toBe('/original');
});
test('an explicit test URL cannot select a non-test database',async()=>{
    process.env.SPRINT2_TEST_DATABASE_URL='postgresql://fixture:placeholder@localhost/customer_data';
    await expect(testDatabase()).rejects.toThrow('isolated test database');expect(Pool).not.toHaveBeenCalled();
});
test('Windows local low-space guard runs before any database connection',async()=>{
    if(process.platform!=='win32')return;
    assertFreeSpace.mockImplementation(()=>{throw new Error('Data volume is full');});
    await expect(testDatabase()).rejects.toThrow('Data volume is full');expect(Pool).not.toHaveBeenCalled();
});
