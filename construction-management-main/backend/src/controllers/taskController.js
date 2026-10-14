function createTaskController({ service, progressService }) {
    return {
        async list(req, res) {
            res.json({ tasks: await service.list(Number(req.params.projectId)) });
        },
        async create(req, res) {
            res.status(201).json({ task: await service.save(Number(req.params.projectId), null, req.body) });
        },
        async update(req, res) {
            res.json({ task: await service.save(Number(req.params.projectId), Number(req.params.taskId), req.body) });
        },
        async updateProgress(req, res) {
            res.json({ task: await progressService.updateProgress(
                Number(req.params.projectId), Number(req.params.taskId), req.body
            ) });
        },
        async listDependencies(req, res) {
            res.json({ dependencies: await service.listDependencies(Number(req.params.projectId)) });
        },
        async addDependency(req, res) {
            res.status(201).json({ dependency: await service.addDependency(
                Number(req.params.projectId), Number(req.params.taskId), req.body
            ) });
        },
        async removeDependency(req, res) {
            await service.removeDependency(
                Number(req.params.projectId), Number(req.params.taskId), Number(req.params.dependencyId)
            );
            res.status(204).end();
        }
    };
}

module.exports = { createTaskController };
