const path=require('node:path');
function loadEnvironment(){require('dotenv').config({path:path.resolve(__dirname,'../../.env'),quiet:true});}
module.exports={loadEnvironment};
