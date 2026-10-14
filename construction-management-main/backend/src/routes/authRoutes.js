const express = require("express");
const { createAuthController } = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");

function createAuthRoutes(options) {
    const router = express.Router();
    const controller = createAuthController(options);
    router.post("/register", controller.register);
    router.post("/login", controller.login);
    router.post("/logout", controller.logout);
    router.get("/me", options?.authorization?.requireAuth || requireAuth, (req, res) => res.json({ user: req.user }));
    return router;
}

module.exports = { createAuthRoutes };
