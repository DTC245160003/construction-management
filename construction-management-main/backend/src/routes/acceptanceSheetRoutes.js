const express = require("express");
const { createAcceptanceSheetModel } = require("../models/acceptanceSheetModel");
const { createAcceptanceSheetService } = require("../services/acceptanceSheetService");
const { createAcceptanceSheetController } = require("../controllers/acceptanceSheetController");

function createAcceptanceSheetRoutes({ pool, serviceOverride } = {}) {
    pool ||= require("../config/database");
    const model = createAcceptanceSheetModel(pool);
    const service = serviceOverride || createAcceptanceSheetService({ model, pool });
    const controller = createAcceptanceSheetController({ service });

    const router = express.Router();

    router.get("/prepare", controller.prepare);
    router.get("/", controller.list);
    router.get("/:id", controller.detail);
    router.post("/", controller.create);

    return router;
}

module.exports = { createAcceptanceSheetRoutes };
