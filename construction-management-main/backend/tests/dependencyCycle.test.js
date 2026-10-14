const { createTaskService } = require("../src/services/taskService");
const { buildGraph, topologicalSort, createCycleError } = require("../src/services/scheduleService");

const tasks = [1, 2, 3, 4, 5].map((id) => ({ id, name: `Công việc ${String.fromCharCode(64 + id)}`, duration_days: 1 }));
const edge = (predecessor_task_id, successor_task_id) => ({ predecessor_task_id, successor_task_id, dependency_type: "FS", lag_days: 0 });

test("T-24 checks the candidate graph before calling INSERT", async () => {
    const dependencies = [edge(1, 2), edge(2, 3)];
    const original = structuredClone(dependencies);
    const transaction = {
        list: jest.fn(async () => tasks),
        listDependencies: jest.fn(async () => dependencies),
        createDependency: jest.fn()
    };
    const model = { withProjectTransaction: jest.fn(async (_, operation) => operation(transaction)) };
    await expect(createTaskService({ model }).addDependency(37, 1, {
        predecessor_task_id: 3, dependency_type: "FF", lag_days: -2
    })).rejects.toMatchObject({ status: 422, cycle: expect.arrayContaining([
        { id: 1, name: "Công việc A" }, { id: 2, name: "Công việc B" }, { id: 3, name: "Công việc C" }
    ]) });
    expect(transaction.createDependency).not.toHaveBeenCalled();
    expect(model.withProjectTransaction).toHaveBeenCalledWith(37, expect.any(Function));
    expect(dependencies).toEqual(original);
});

test("T-24 a valid candidate is written inside the transaction with signed lag", async () => {
    const transaction = {
        list: jest.fn(async () => tasks),
        listDependencies: jest.fn(async () => [edge(1, 2)]),
        createDependency: jest.fn(async (_, successorId, values) => ({ id: 99, successor_task_id: successorId, ...values }))
    };
    const model = { withProjectTransaction: async (_, operation) => operation(transaction) };
    const dependency = await createTaskService({ model }).addDependency(37, 3, {
        predecessor_task_id: 2, dependency_type: "SF", lag_days: -2
    });
    expect(dependency).toMatchObject({ successor_task_id: 3, predecessor_task_id: 2, dependency_type: "SF", lag_days: -2 });
    expect(transaction.createDependency).toHaveBeenCalledTimes(1);
});

test("T-25 cycle message follows actual reverse edges even with disjoint cycles and a downstream tail", () => {
    const graph = buildGraph(tasks, [edge(1, 2), edge(2, 1), edge(2, 3), edge(3, 4), edge(4, 3), edge(4, 5)]);
    const error = createCycleError(graph, topologicalSort(graph).cycleTasks);
    expect(error.status).toBe(422);
    expect(error.cycle.length).toBeGreaterThan(1);
    expect(new Set(error.cycle.map((task) => task.id)).size).toBe(error.cycle.length);
    for (const [index, task] of error.cycle.entries()) {
        expect(graph.reverseAdjacency.get(task.id)).toContain(error.cycle[(index + 1) % error.cycle.length].id);
        expect(error.message).toContain(task.name);
    }
    expect(error.message).not.toContain("Công việc E");
    expect(error.message).not.toMatch(/\d/);
});
