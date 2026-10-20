function configuredOrigins(env=process.env){
    const input=env.CORS_ORIGINS || env.APP_ORIGIN || (env.NODE_ENV==='production'?'':'http://localhost:5173');
    return input.split(',').map(value=>value.trim()).filter(Boolean).map(value=>{
        let url;try{url=new URL(value);}catch{throw new Error('CORS_ORIGINS must contain HTTP(S) origins.');}
        if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('CORS_ORIGINS must contain HTTP(S) origins without credentials or paths.');
        return url.origin;
    });
}
function createCorsMiddleware({origins=configuredOrigins()}={}){
    const allowed=new Set(origins);
    return (req,res,next)=>{
        const origin=req.headers.origin;
        if(allowed.has(origin)){
            res.setHeader('Access-Control-Allow-Origin',origin);
            res.setHeader('Access-Control-Allow-Credentials','true');
            res.setHeader('Access-Control-Allow-Headers','Content-Type');
            res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');
            res.vary('Origin');
        }
        if(req.method==='OPTIONS')return allowed.has(origin)?res.sendStatus(204):res.sendStatus(403);
        return next();
    };
}
module.exports=(req,res,next)=>createCorsMiddleware()(req,res,next);
module.exports.createCorsMiddleware=createCorsMiddleware;
module.exports.configuredOrigins=configuredOrigins;
