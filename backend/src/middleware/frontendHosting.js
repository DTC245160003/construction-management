const fs=require('node:fs'),path=require('node:path'),express=require('express');
const publicRoutes=new Set(['/','/login','/register','/accept-invitation','/home','/work-items','/schedule','/members','/projects','/calendar','/field-assignments','/notifications','/audit-logs','/site-journal','/acceptance','/payments','/costs-materials','/site-photos','/reports','/settings','/system-admin']);
const defaultDirectory=path.resolve(__dirname,'../../../frontend/dist');
function createFrontendHosting({directory=process.env.FRONTEND_STATIC_DIR||defaultDirectory}={}){
    const folder=path.resolve(directory),index=path.join(folder,'index.html');
    if(!fs.existsSync(index))return (req,res,next)=>next();
    const staticFiles=express.static(folder,{index:false,redirect:false,dotfiles:'deny',setHeaders(res,file){
        res.setHeader('Cache-Control',file.includes(`${path.sep}assets${path.sep}`)?'public, max-age=31536000, immutable':'no-cache');
    }});
    return (req,res,next)=>{
        if(!['GET','HEAD'].includes(req.method))return next();
        if(req.path.split('/').some(segment=>segment.startsWith('.')))return res.sendStatus(404);
        const api=/^\/(auth|admin|api|health|projects)(\/|$)/.test(req.path);
        const page=publicRoutes.has(req.path)||(!api&&!path.extname(req.path));
        if(page && req.headers.accept?.includes('text/html')){res.setHeader('Cache-Control','no-cache');return res.sendFile('index.html',{root:folder});}
        return staticFiles(req,res,next);
    };
}
module.exports={createFrontendHosting,defaultDirectory};
