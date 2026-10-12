const express = require("express");
const routes = require("./routes");
const { createSession, createSessionStore } = require("./config/session");
const { createUserModel } = require("./models/userModel");
const { createAuthService } = require("./services/authService");
const { createAuthRoutes } = require("./routes/authRoutes");
const { createProjectRoutes } = require("./routes/projectRoutes");
const { createWorkItemRoutes } = require("./routes/workItemRoutes");
const { createTaskRoutes } = require("./routes/taskRoutes");
const { createScheduleRoutes } = require("./routes/scheduleRoutes");
const { createProjectOperationsRoutes } = require("./routes/projectOperationsRoutes");
const { createSiteManagementRoutes } = require("./routes/siteManagementRoutes");
const { createSystemAdminRoutes } = require("./routes/systemAdminRoutes");
const corsMiddleware = require("./middleware/cors");
const errorHandler = require("./middleware/errorHandler");

function createApp({ authService, sessionStore, sessionSecret, secureCookies, trustProxy } = {}) {
    if (!authService || !sessionStore) {
        const pool = require("./config/database");
        authService ||= createAuthService({ userModel: createUserModel(pool) });
        sessionStore ||= createSessionStore(pool);
    }

    const app = express();
    app.use(corsMiddleware);
    app.set("trust proxy", trustProxy ?? (process.env.TRUST_PROXY === "1" ? 1 : false));
    const session = createSession({ store: sessionStore, secret: sessionSecret, secureCookies });
    app.use("/projects/:projectId/photos", express.json({ limit: "15mb" }));
    app.use("/projects/:projectId/costs/import", express.json({ limit: "2mb" }));
    app.use(express.json());
    app.use(session.middleware);
    app.use("/", routes);
    app.use("/auth", createAuthRoutes({ authService, ...session }));
    app.use("/admin", createSystemAdminRoutes());
    app.use("/projects", createProjectRoutes());
    app.use("/projects", createProjectOperationsRoutes());
    app.use("/projects", createSiteManagementRoutes());
    app.use("/projects", createWorkItemRoutes());
    app.use("/projects", createTaskRoutes());
    app.use("/projects", createScheduleRoutes());
    app.use(errorHandler);
    return app;
}

module.exports = createApp();
module.exports.createApp = createApp;
