function requireRoles(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: "Vui lòng đăng nhập" });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ message: "Bạn không có quyền thực hiện thao tác này" });
        }
        return next();
    };
}

function requireSystemAdmin(req,res,next) {
    if (req.user?.system_role!=="super_admin") return res.status(403).json({ message:"Chỉ Super Admin được quản trị hệ thống" });
    return next();
}

function createAuthorization({ userModel }) {
    return {
        async requireAuth(req, res, next) {
            const userId = req.session?.userId;
            if (!Number.isInteger(userId) || userId <= 0) {
                return res.status(401).json({ message: "Vui lòng đăng nhập" });
            }
            // Read the current role from PostgreSQL, never from the request or a stale session role.
            const user = await userModel.findByIdWithRole(userId);
            if (!user || user.is_active===false) {
                return res.status(401).json({ message: "Phiên đăng nhập không còn hợp lệ" });
            }
            req.user = user;
            return next();
        },
        requireRoles
    };
}

let defaultAuthorization;

function requireAuth(req, res, next) {
    if (!defaultAuthorization) {
        const { createUserModel } = require("../models/userModel");
        const pool = require("../config/database");
        defaultAuthorization = createAuthorization({ userModel: createUserModel(pool) });
    }
    return defaultAuthorization.requireAuth(req, res, next);
}

module.exports = { createAuthorization, requireAuth, requireRoles, requireSystemAdmin };
