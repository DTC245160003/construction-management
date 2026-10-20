jest.mock('../src/server',()=>({main:jest.fn(async()=>{})}));
jest.mock('../src/run-migration',()=>({runMigrations:jest.fn()}));
const {main}=require('../scripts/start-sprint45-demo.cjs');
const server=require('../src/server'),migration=require('../src/run-migration');
let oldEnv;
beforeEach(()=>{oldEnv={...process.env};jest.clearAllMocks();jest.spyOn(console,'log').mockImplementation(()=>{});});
afterEach(()=>{process.env=oldEnv;jest.restoreAllMocks();});
test('historical startup keeps DATABASE_URL on the selected copy and never migrates/seeds existing accounts',async()=>{
 process.env.DATABASE_URL='postgresql://fixture:placeholder@localhost/original?sslmode=require';process.env.SPRINT45_DEMO_DB='legacy_reviewed_copy';
 await main();expect(new URL(process.env.DATABASE_URL).pathname).toBe('/legacy_reviewed_copy');expect(new URL(process.env.DATABASE_URL).searchParams.get('sslmode')).toBe('require');
 expect(migration.runMigrations).not.toHaveBeenCalled();expect(server.main).toHaveBeenCalledTimes(1);
});
test('historical startup refuses selection of the configured original',async()=>{
 process.env.DATABASE_URL='postgresql://fixture:placeholder@localhost/original';process.env.SPRINT45_DEMO_DB='original';
 await expect(main()).rejects.toThrow('separate, reviewed database copy');expect(server.main).not.toHaveBeenCalled();expect(migration.runMigrations).not.toHaveBeenCalled();
});
