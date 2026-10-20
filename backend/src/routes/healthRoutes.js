const express = require("express");
const { createHealthService } = require("../services/healthService");

function createHealthRoutes({ pool, service = createHealthService({ pool }) }) {
    const router = express.Router();
    router.get("/", async (req, res) => {
        const health = await service.check();
        res.set("Cache-Control", "no-store")
            .status(health.status === "ok" ? 200 : 503).json(health);
    });
    return router;
}

module.exports = { createHealthRoutes };
