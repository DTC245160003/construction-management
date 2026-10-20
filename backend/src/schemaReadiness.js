const {runMigrations}=require('./run-migration');
async function assertSchemaReady(pool){
    const client=await pool.connect();
    try{
        const status=await runMigrations({client,command:'status'});
        if(status.some(line=>line.startsWith('pending:')))throw new Error('Database schema needs a reviewed upgrade. Verify backup and restored-copy tests before running migrations; startup never migrates or seeds automatically.');
    }finally{client.release();}
}
module.exports={assertSchemaReady};
