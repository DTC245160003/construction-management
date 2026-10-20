require('../src/config/environment').loadEnvironment();
const pool=require('../src/config/database');
const {assertSchemaReady}=require('../src/schemaReadiness');
assertSchemaReady(pool).then(()=>console.log('Database schema is ready; no data or migration history was changed.')).catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>pool.end());
