function createProjectAccess({ memberModel }) {
    function requireProjectMember(...allowedRoles) {
        return async (req, res, next) => {
            if (allowedRoles.length === 0) {
                return res.status(403).json({
                    message: "Project route has no allowed roles configured"
                });
            }

            const projectId = Number(req.params.projectId);
            if (!Number.isInteger(projectId) || projectId <= 0) {
                return res.status(403).json({ message: "Project access denied" });
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
                return res.status(403).json({ message: "Bạn không có quyền truy cập dự án này" });
            }

            req.projectMember = member;
            return next();
        };
    }

    return { requireProjectMember };
}

module.exports = { createProjectAccess };
