const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { createProjectAccess } = require("../middleware/projectAccess");
const { createProjectMemberModel } = require("../models/projectMemberModel");
const { createTaskModel } = require("../models/taskModel");
const { createTaskService } = require("../services/taskService");
const { createTaskController } = require("../controllers/taskController");
const { createTaskProgressModel } = require("../models/taskProgressModel");
const { createTaskProgressService } = require("../services/taskProgressService");

function createTaskRoutes({ authorization = { requireAuth }, memberModel, model, progressModel } = {}) {
    if (!memberModel || !model) {
        const pool = require("../config/database");
        memberModel ||= createProjectMemberModel(pool);
        model ||= createTaskModel(pool);
        progressModel ||= createTaskProgressModel(pool);
    }
    const router = express.Router();
    const access = createProjectAccess({ memberModel });
    const controller = createTaskController({ service: createTaskService({ model }),
        progressService: createTaskProgressService({ model: progressModel || model }) });
    const membership = access.requireProjectMember("admin", "manager", "engineer", "member", "project_manager");
    const read = access.requireProjectMember("admin", "manager", "engineer", "member", "project_manager", "viewer");
    router.use(authorization.requireAuth);
    router.get("/:projectId/tasks", read,controller.list);
    router.post("/:projectId/tasks", membership,controller.create);
    router.patch("/:projectId/tasks/:taskId", membership,controller.update);
    router.patch("/:projectId/tasks/:taskId/progress", membership,controller.updateProgress);
    router.get("/:projectId/dependencies", read,controller.listDependencies);
    router.post("/:projectId/tasks/:taskId/dependencies", membership,controller.addDependency);
    router.delete("/:projectId/tasks/:taskId/dependencies/:dependencyId", membership,controller.removeDependency);
    return router;
}

module.exports = { createTaskRoutes };
