const { Pool } = require("pg");
const {loadEnvironment}=require('./environment');
const {createDatabaseConfig}=require('./databaseConfig');
loadEnvironment();

const pool = new Pool(createDatabaseConfig());

module.exports = pool;
