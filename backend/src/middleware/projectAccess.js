function createProjectAccess({ memberModel }) {
    function requireProjectMember(...allowedRoles) {
        return async (req, res, next) => {
            const deny=async(message,reason)=>{
                if(memberModel.recordDeniedAccess){
                    try{await memberModel.recordDeniedAccess({projectId:Number(req.params.projectId),userId:req.user.id,route:req.route?.path||req.baseUrl,method:req.method,reason});}
                    catch(error){console.error('[authorization] denial audit failed',{code:error.code||'error'});}
                }
                return res.status(403).json({message});
            };
            if (allowedRoles.length === 0) {
                return deny('Project route has no allowed roles configured','unconfigured_route');
            }

            const projectId = Number(req.params.projectId);
            if (!Number.isInteger(projectId) || projectId <= 0 || projectId>2147483647) {
                return deny('Project access denied','invalid_project');
            }

            if (req.user.system_role === "super_admin") {
                req.projectMember = { project_id:projectId,user_id:req.user.id,role:"admin",system_access:true };
                return next();
            }

            const member = await memberModel.findByProjectAndUser({
                projectId,
                userId: req.user.id
            });
            if (!member || !allowedRoles.includes(member.role)) {
                return deny('Bạn không có quyền truy cập dự án này',member?'role_not_allowed':'not_a_member');
            }

            req.projectMember = member;
            return next();
        };
    }

    return { requireProjectMember };
}

module.exports = { createProjectAccess };
