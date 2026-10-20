function positiveInteger(value,fallback,name,maximum) {
    if (value===undefined || value==='') return fallback;
    const number=Number(value);
    if (!Number.isInteger(number) || number<1 || number>maximum) throw new Error(`${name} is out of range.`);
    return number;
}
function createDatabaseConfig(env=process.env) {
    const options={max:positiveInteger(env.DB_POOL_MAX,10,'DB_POOL_MAX',100),connectionTimeoutMillis:positiveInteger(env.DB_CONNECT_TIMEOUT_MS,5000,'DB_CONNECT_TIMEOUT_MS',60000)};
    if (env.DATABASE_URL) {
        let url;
        try { url=new URL(env.DATABASE_URL); } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.'); }
        if (!['postgres:','postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length<2) throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
        // pg handles URL SSL options; never globally disable certificate checks.
        return {...options,connectionString:env.DATABASE_URL};
    }
    return {...options,host:env.DB_HOST,port:env.DB_PORT,database:env.DB_NAME,user:env.DB_USER,password:env.DB_PASSWORD};
}
module.exports={createDatabaseConfig};
