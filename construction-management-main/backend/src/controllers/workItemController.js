function createWorkItemController({ model }) {
    function projectId(req) {
        return Number(req.params.projectId);
    }

    return {
        async list(req, res, next) {
            try {
                res.json({ items: await model.findTree(projectId(req)) });
            } catch (error) {
                next(error);
            }
        },

        async create(req, res, next) {
            try {
                const { title, description, parentId, status, contract_quantity, unit, contract_unit_price } = req.body;
                if (typeof title !== "string" || !title.trim()) {
                    return res.status(400).json({ message: "Tên hạng mục là bắt buộc" });
                }
                const item = await model.create({
                    projectId: projectId(req),
                    parentId,
                    title: title.trim(),
                    description,
                    status,
                    contract_quantity,
                    unit,
                    contract_unit_price
                });
                return res.status(201).json({ item });
            } catch (error) {
                return next(error);
            }
        },

        async update(req, res, next) {
            try {
                const { title, description, parentId, status, contract_quantity, unit, contract_unit_price } = req.body;
                if (title !== undefined && (typeof title !== "string" || !title.trim())) {
                    return res.status(400).json({ message: "Tên hạng mục là bắt buộc" });
                }
                if (typeof model.findParentCycle === "function"
                    && parentId !== null && parentId !== undefined) {
                    const cycle = await model.findParentCycle({
                        projectId: projectId(req),
                        itemId: Number(req.params.itemId),
                        parentId: Number(parentId)
                    });
                    if (cycle) {
                        return res.status(422).json({
                            message: `Không thể đặt hạng mục "${cycle.source_title}" làm con của hậu duệ "${cycle.parent_title}"`
                        });
                    }
                }
                const item = await model.update({
                    projectId: projectId(req),
                    itemId: Number(req.params.itemId),
                    parentId,
                    title: title !== undefined ? title.trim() : undefined,
                    description,
                    status,
                    contract_quantity,
                    unit,
                    contract_unit_price
                });
                if (!item) {
                    return res.status(404).json({ message: "Không tìm thấy hạng mục" });
                }
                return res.json({ item });
            } catch (error) {
                return next(error);
            }
        },

        async remove(req, res, next) {
            try {
                if (typeof model.findSubtreeSummary === "function") {
                    const summary = await model.findSubtreeSummary({
                        projectId: projectId(req), itemId: Number(req.params.itemId)
                    });
                    if (!summary) {
                        return res.status(404).json({ message: "Không tìm thấy hạng mục" });
                    }
                    if (summary.descendant_count > 0) {
                        return res.status(409).json({
                            message: `Không thể xóa hạng mục "${summary.item_title}" vì còn ${summary.descendant_count} công việc đang gắn`
                        });
                    }
                }
                const removed = await model.remove({
                    projectId: projectId(req), itemId: Number(req.params.itemId)
                });
                return removed
                    ? res.status(204).end()
                    : res.status(404).json({ message: "Không tìm thấy hạng mục" });
            } catch (error) {
                if (error.code === "23503" && error.constraint === "tasks_work_item_id_fkey") {
                    return res.status(409).json({ message: "Không thể xóa hạng mục đang có công việc" });
                }
                return next(error);
            }
        }
    };
}

module.exports = { createWorkItemController };
