const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { createProjectAccess } = require("../middleware/projectAccess");
const { createProjectMemberModel } = require("../models/projectMemberModel");
const { createWorkItemCrudModel } = require("../models/workItemCrudModel");
const { createWorkItemController } = require("../controllers/workItemController");

function createWorkItemRoutes({ authorization = { requireAuth }, memberModel, model } = {}) {
    if (!memberModel || !model) {
        const pool = require("../config/database");
        memberModel ||= createProjectMemberModel(pool);
        model ||= createWorkItemCrudModel(pool);
    }

    const router = express.Router();
    const projectAccess = createProjectAccess({ memberModel });
    const controller = createWorkItemController({ model });
    router.use(authorization.requireAuth);
    const write=projectAccess.requireProjectMember("admin","manager","engineer","member","project_manager");
    const read=projectAccess.requireProjectMember("admin","manager","engineer","member","project_manager","viewer");
    router.get("/:projectId/items",read,controller.list);
    router.post("/:projectId/items",write,controller.create);
    router.patch("/:projectId/items/:itemId",write,controller.update);
    router.delete("/:projectId/items/:itemId",write,controller.remove);
    return router;
}

module.exports = { createWorkItemRoutes };
