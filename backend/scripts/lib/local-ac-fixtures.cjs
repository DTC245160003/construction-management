// Deterministic input shared by the focused regression and opt-in local probe.
// The first 499 edges form a chain; extra forward edges keep its longest path.
function createLargeTaskFixture() {
    const tasks = Array.from({ length: 500 }, (_, index) => ({
        id: index + 1,
        name: `Công việc ${String(index + 1).padStart(3, "0")}`,
        duration_days: 1
    }));
    const edge = (predecessor_task_id, successor_task_id) => ({
        predecessor_task_id, successor_task_id, dependency_type: "FS", lag_days: 0
    });
    const dependencies = tasks.slice(1).map(task => edge(task.id - 1, task.id));
    for (let gap = 2; dependencies.length < 1999; gap++) {
        for (let predecessor = 1; predecessor + gap <= tasks.length && dependencies.length < 1999; predecessor++) {
            if (predecessor === 1 && predecessor + gap === tasks.length) continue;
            dependencies.push(edge(predecessor, predecessor + gap));
        }
    }
    return {
        tasks,
        dependencies,
        invalid: { successorId: 1, body: { predecessor_task_id: 500, dependency_type: "FS", lag_days: 0 } },
        valid: { successorId: 500, body: { predecessor_task_id: 1, dependency_type: "FS", lag_days: 0 } }
    };
}

function createInMemoryTaskModel(fixture) {
    const calls = { taskReads: 0, dependencyReads: 0, writes: 0 };
    const transaction = {
        async list() { calls.taskReads++; return fixture.tasks; },
        async listDependencies() { calls.dependencyReads++; return fixture.dependencies; },
        async createDependency(projectId, successorId, values) {
            calls.writes++;
            return { id: 2000, project_id: projectId, successor_task_id: successorId, ...values };
        }
    };
    return { calls, model: { withProjectTransaction: async (_, operation) => operation(transaction) } };
}

module.exports = { createLargeTaskFixture, createInMemoryTaskModel };
