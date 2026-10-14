const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { createProjectAccess } = require("../middleware/projectAccess");
const { createProjectMemberModel } = require("../models/projectMemberModel");

function registerProjectRoute(router, { method, path, roles, handler, projectAccess }) {
    router[method](path, projectAccess.requireProjectMember(...(roles || [])), handler);
}

function createProjectRoutes({ authorization = { requireAuth }, memberModel } = {}) {
    if (!memberModel) {
        const pool = require("../config/database");
        memberModel = createProjectMemberModel(pool);
    }

    const router = express.Router();
    const projectAccess = createProjectAccess({ memberModel });
    router.use(authorization.requireAuth);

    registerProjectRoute(router, {
        method: "get",
        path: "/:projectId",
        roles: ["admin", "manager", "engineer", "member", "project_manager", "worker", "accountant", "viewer"],
        projectAccess,
        handler: (req, res) => res.json({ projectId: Number(req.params.projectId) })
    });

    registerProjectRoute(router, {
        method: "get",
        path: "/:projectId/unconfigured",
        roles: [],
        projectAccess,
        handler: (req, res) => res.json({ reachable: true })
    });

    return router;
}

module.exports = { createProjectRoutes, registerProjectRoute };
