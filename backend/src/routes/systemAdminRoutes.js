const express = require("express");
const { requireAuth, requireSystemAdmin } = require("../middleware/auth");
const { createSystemAdminService } = require("../services/systemAdminService");

function createSystemAdminRoutes({ pool,authorization={ requireAuth } }={}) {
    pool ||= require("../config/database");
    const service=createSystemAdminService({ pool }),router=express.Router();
    router.use(authorization.requireAuth,requireSystemAdmin);
    router.get("/users",async (req,res) => res.json({ users:await service.users(req.query.q) }));
    router.patch("/users/:userId",async (req,res) => res.json({ user:await service.accountStatus(req.user,Number(req.params.userId),req.body || {}) }));
    router.delete("/users/:userId",(req,res) => res.status(405).json({ message:"Giữ tài khoản và lịch sử: dùng khóa tài khoản; không hỗ trợ xóa hoặc cấp quyền hệ thống qua API" }));
    router.get("/audit-logs",async (req,res) => res.json({ entries:await service.audit() }));
    router.post("/projects/:projectId/members",async (req,res) => res.status(201).json(await service.grantMember(req.user,Number(req.params.projectId),req.body || {})));
    router.patch("/projects/:projectId/members/:userId",async (req,res) => res.json({ member:await service.changeMember(req.user,Number(req.params.projectId),Number(req.params.userId),req.body || {}) }));
    router.delete("/projects/:projectId/members/:userId",async (req,res) => { await service.removeMember(req.user,Number(req.params.projectId),Number(req.params.userId)); res.sendStatus(204); });
    return router;
}
module.exports = { createSystemAdminRoutes };
