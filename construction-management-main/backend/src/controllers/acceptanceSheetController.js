function createAcceptanceSheetController({ service }) {
    return {
        // GET /api/acceptance-sheets?projectId=...
        list: async (req, res, next) => {
            try {
                const projectId = Number(req.query.projectId || req.params.projectId);
                const result = await service.listSheets(projectId);
                res.json({ sheets: result });
            } catch (err) {
                next(err);
            }
        },

        // GET /api/acceptance-sheets/prepare?projectId=...
        prepare: async (req, res, next) => {
            try {
                const projectId = Number(req.query.projectId || req.params.projectId);
                const items = await service.getPreparationData(projectId);
                res.json({ items });
            } catch (err) {
                next(err);
            }
        },

        // GET /api/acceptance-sheets/:id
        detail: async (req, res, next) => {
            try {
                const id = Number(req.params.id);
                const result = await service.getSheetById(id);
                res.json({ sheet: result });
            } catch (err) {
                next(err);
            }
        },

        // POST /api/acceptance-sheets
        create: async (req, res, next) => {
            try {
                const projectId = Number(req.body.project_id || req.query.projectId || req.params.projectId);
                const actorId = req.user ? req.user.id : null;
                const result = await service.createSheet(projectId, actorId, req.body);
                res.status(201).json({ sheet: result });
            } catch (err) {
                next(err);
            }
        }
    };
}

module.exports = { createAcceptanceSheetController };
