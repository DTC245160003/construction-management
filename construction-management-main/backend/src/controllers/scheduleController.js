function createScheduleController({ service }) {
    return {
        async get(req, res) {
            if (req.query.critical !== undefined && !["true", "false"].includes(req.query.critical)) {
                return res.status(400).json({ message: "Bộ lọc critical phải là true hoặc false" });
            }
            const schedule = await service.getSchedule(Number(req.params.projectId), {
                criticalOnly: req.query.critical === "true"
            });
            const response = { schedule };
            if (schedule?.summary && schedule.length > 0) response.summary = schedule.summary;
            return res.json(response);
        },

        async saveBaseline(req, res) {
            const projectId = Number(req.params.projectId);
            const baselines = await service.saveBaseline(projectId, req.user.id);
            return res.status(201).json({
                message: "Đã chốt kế hoạch gốc thành công",
                baselines
            });
        },

        async getBaselineHistory(req, res) {
            const projectId = Number(req.params.projectId);
            const history = await service.getBaselineHistory(projectId);
            return res.json({ history });
        },

        async listMilestones(req, res) {
            const projectId = Number(req.params.projectId);
            const milestones = await service.listMilestones(projectId);
            return res.json({ milestones });
        },

        async createMilestone(req, res) {
            const projectId = Number(req.params.projectId);
            const workItemId = req.body?.work_item_id ?? req.body?.workItemId;
            const name = req.body?.name;
            const targetDate = req.body?.target_date ?? req.body?.targetDate;

            if (!workItemId || !name || !targetDate) {
                return res.status(400).json({ message: "Vui lòng nhập đầy đủ hạng mục, tên mốc và ngày bắt buộc" });
            }
            try {
                const milestone = await service.createMilestone(projectId, req.user.id, {
                    work_item_id: Number(workItemId),
                    name: String(name).trim(),
                    target_date: targetDate
                });
                return res.status(201).json({ milestone });
            } catch (err) {
                console.error("[scheduleController:createMilestone] Error:", err);
                if (err.code === "23505") { // unique constraint violation
                    return res.status(409).json({ message: "Hạng mục này đã có mốc bàn giao đang có hiệu lực" });
                }
                return res.status(500).json({ message: err.message || "Đã xảy ra lỗi khi tạo mốc bàn giao" });
            }
        },

        async deleteMilestone(req, res) {
            const projectId = Number(req.params.projectId);
            const milestoneId = Number(req.params.id);
            const deleted = await service.deleteMilestone(projectId, milestoneId);
            if (!deleted) {
                return res.status(404).json({ message: "Không tìm thấy mốc bàn giao" });
            }
            return res.json({ message: "Đã xóa mốc bàn giao", id: milestoneId });
        },

        async listMilestoneAlerts(req, res) {
            const projectId = Number(req.params.projectId);
            const status = req.query.status || null;
            const alerts = await service.listMilestoneAlerts(projectId, status);
            return res.json({ alerts });
        }
    };
}

module.exports = { createScheduleController };
