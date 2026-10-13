const express = require("express");
const { createSession, createSessionStore } = require("../../src/config/session");
const { createAuthorization } = require("../../src/middleware/auth");
const { createAuthService } = require("../../src/services/authService");
const { createUserModel } = require("../../src/models/userModel");
const { createProjectMemberModel } = require("../../src/models/projectMemberModel");
const { createAuthRoutes } = require("../../src/routes/authRoutes");
const { createSystemAdminRoutes } = require("../../src/routes/systemAdminRoutes");
const { createProjectOperationsRoutes } = require("../../src/routes/projectOperationsRoutes");
const { createSiteManagementRoutes } = require("../../src/routes/siteManagementRoutes");
const { createWorkItemRoutes } = require("../../src/routes/workItemRoutes");
const { createWorkItemCrudModel } = require("../../src/models/workItemCrudModel");
const { createTaskRoutes } = require("../../src/routes/taskRoutes");
const { createTaskModel } = require("../../src/models/taskModel");
const { createTaskProgressModel } = require("../../src/models/taskProgressModel");
const { createScheduleRoutes } = require("../../src/routes/scheduleRoutes");
const { createScheduleModel } = require("../../src/models/scheduleModel");
const errorHandler = require("../../src/middleware/errorHandler");

// Same controllers, services, authorization and PostgreSQL session store as the
// application; only the pool points at an isolated test schema.
function operationsApp(pool) {
    const userModel = createUserModel(pool);
    const authorization = createAuthorization({ userModel });
    const store = createSessionStore(pool);
    const session = createSession({ store, secret: "operations-integration-tests-only-secret", secureCookies: false });
    const memberModel = createProjectMemberModel(pool);
    const app = express();
    app.set("env", process.env.TEST_DIAGNOSTICS ? "development" : "test");
    app.use("/projects/:projectId/photos",express.json({ limit:"15mb" }));
    app.use("/projects/:projectId/costs/import",express.json({ limit:"2mb" }));
    app.use(express.json());
    app.use(session.middleware);
    app.use("/auth", createAuthRoutes({ authService: createAuthService({ userModel }), authorization, ...session }));
    app.use("/admin",createSystemAdminRoutes({ pool,authorization }));
    app.use("/projects", createProjectOperationsRoutes({ pool, authorization }));
    app.use("/projects", createSiteManagementRoutes({ pool, authorization }));
    app.use("/api/v1/projects", createSiteManagementRoutes({ pool, authorization }));
    app.use("/projects", createWorkItemRoutes({ model: createWorkItemCrudModel(pool), memberModel, authorization }));
    app.use("/projects", createTaskRoutes({ model: createTaskModel(pool), progressModel: createTaskProgressModel(pool), memberModel, authorization }));
    app.use("/projects", createScheduleRoutes({ model: createScheduleModel(pool), memberModel, authorization }));
    app.use(errorHandler);
    return { app, store };
}
module.exports = { operationsApp };
