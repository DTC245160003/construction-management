const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { createProjectAccess } = require("../middleware/projectAccess");
const { createProjectMemberModel } = require("../models/projectMemberModel");
const { createScheduleModel } = require("../models/scheduleModel");
const { createScheduleService } = require("../services/scheduleService");
const { createScheduleController } = require("../controllers/scheduleController");

function createScheduleRoutes({ authorization = { requireAuth }, memberModel, model } = {}) {
    if (!memberModel || !model) {
        const pool = require("../config/database");
        memberModel ||= createProjectMemberModel(pool);
        model ||= createScheduleModel(pool);
    }
    const router = express.Router();
    const access = createProjectAccess({ memberModel });
    const controller = createScheduleController({ service: createScheduleService({ model }) });
    const READ_ROLES = ["admin", "manager", "engineer", "member", "project_manager", "viewer"];
    const MANAGE_ROLES = ["admin", "project_manager", "manager"];
    const MILESTONE_ROLES = ["admin", "project_manager", "manager", "viewer"]; // Ban quản lý & Chủ đầu tư

    // T-27 & T-42: Lấy tiến độ kèm baseline
    router.get("/:projectId/schedule", authorization.requireAuth,
        access.requireProjectMember(...READ_ROLES), controller.get);

    // T-41: Chốt kế hoạch gốc (chỉ Ban quản lý)
    router.post("/:projectId/baselines", authorization.requireAuth,
        access.requireProjectMember(...MANAGE_ROLES), controller.saveBaseline);

    // T-41: Lịch sử các lần chốt kế hoạch gốc
    router.get("/:projectId/baselines/history", authorization.requireAuth,
        access.requireProjectMember(...READ_ROLES), controller.getBaselineHistory);

    // T-43: Danh sách mốc hạng mục
    router.get("/:projectId/work-item-milestones", authorization.requireAuth,
        access.requireProjectMember(...READ_ROLES), controller.listMilestones);

    // T-43: Đặt mốc bàn giao cho hạng mục (Chủ đầu tư & Ban quản lý)
    router.post("/:projectId/work-item-milestones", authorization.requireAuth,
        access.requireProjectMember(...MILESTONE_ROLES), controller.createMilestone);

    // T-43: Xóa mốc bàn giao (Chủ đầu tư & Ban quản lý)
    router.delete("/:projectId/work-item-milestones/:id", authorization.requireAuth,
        access.requireProjectMember(...MILESTONE_ROLES), controller.deleteMilestone);

    // T-44, T-45: Danh sách cảnh báo mốc kèm chuỗi việc gây chậm
    router.get("/:projectId/milestone-alerts", authorization.requireAuth,
        access.requireProjectMember(...READ_ROLES), controller.listMilestoneAlerts);

    return router;
}

module.exports = { createScheduleRoutes };
