function databaseName(config){
    return config.connectionString?decodeURIComponent(new URL(config.connectionString).pathname.slice(1)):config.database;
}
function targetDatabase(config,name){
    if(config.connectionString){const url=new URL(config.connectionString);url.pathname='/'+encodeURIComponent(name);return{...config,connectionString:url.href};}
    return{...config,database:name};
}
function libpqEnvironment(config,env=process.env){
    const connection=config.connectionString?new URL(config.connectionString):null;
    const result={...env,PGHOST:connection?.hostname||config.host||'localhost',PGPORT:String(connection?.port||config.port||5432),PGUSER:connection?decodeURIComponent(connection.username):config.user,PGPASSWORD:connection?decodeURIComponent(connection.password):config.password,PGDATABASE:databaseName(config)};
    for(const [parameter,key]of [['sslmode','PGSSLMODE'],['sslrootcert','PGSSLROOTCERT'],['sslcert','PGSSLCERT'],['sslkey','PGSSLKEY']])if(connection?.searchParams.has(parameter))result[key]=connection.searchParams.get(parameter);
    return result;
}
module.exports={databaseName,targetDatabase,libpqEnvironment};
