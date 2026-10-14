const { performance } = require("node:perf_hooks");
const { buildGraph, topologicalSort, loadProjectGraph } = require("../src/services/scheduleService");
const { calculateForwardPass } = require("../src/services/cpmService");

const tasks = (...ids) => ids.map((id) => ({ id, duration_days: 2 }));
const edges = (...pairs) => pairs.map(([predecessor_task_id, successor_task_id]) => ({
    predecessor_task_id, successor_task_id, dependency_type: "FS", lag_days: 0
}));

function expectValidOrder(graph, result) {
    expect(result.hasCycle).toBe(false);
    expect(result.cycleTasks).toEqual([]);
    expect(result.order).toHaveLength(graph.tasks.size);
    expect(new Set(result.order)).toEqual(new Set(graph.tasks.keys()));
    const positions = new Map(result.order.map((id, index) => [id, index]));
    for (const [id, successors] of graph.adjacency) {
        for (const successor of successors) expect(positions.get(id)).toBeLessThan(positions.get(successor));
    }
}

describe("T-15 graph", () => {
    test("constructs both adjacency lists, isolated nodes and indegrees without mutating rows", () => {
        const rows = tasks("A", "B", "C", "D", "isolated");
        const dependencies = edges(["A", "C"], ["B", "C"], ["C", "D"]);
        const snapshot = structuredClone({ rows, dependencies });
        const graph = buildGraph(rows, dependencies);
        expect(graph.tasks.size).toBe(5);
        expect([...graph.adjacency.values()].flat()).toHaveLength(3);
        expect(graph.adjacency.get("A")).toEqual(["C"]);
        expect(graph.reverseAdjacency.get("C")).toEqual(["A", "B"]);
        expect([...graph.indegree]).toEqual([["A", 0], ["B", 0], ["C", 2], ["D", 1], ["isolated", 0]]);
        expect({ rows, dependencies }).toEqual(snapshot);
    });

    test("loads a project using exactly two scoped SELECTs", async () => {
        const pool = { query: jest.fn()
            .mockResolvedValueOnce({ rows: tasks(1, 2, 3) })
            .mockResolvedValueOnce({ rows: edges([1, 2]) }) };
        const graph = await loadProjectGraph(pool, 7);
        expect(graph.tasks.size).toBe(3);
        expect(pool.query).toHaveBeenCalledTimes(2);
        for (const [sql, params] of pool.query.mock.calls) {
            expect(sql).toMatch(/project_id = \$1/);
            expect(params).toEqual([7]);
        }
    });

    test("rejects dangling dependencies and duplicate task IDs", () => {
        expect(() => buildGraph(tasks(1), edges([1, 2]))).toThrow(/outside/);
        expect(() => buildGraph(tasks(1, 1), [])).toThrow(/Duplicate/);
    });
});

describe("T-16 Kahn", () => {
    test("valid order with multiple roots, branches, merge and isolated task; leaves graph intact", () => {
        const graph = buildGraph(tasks(1, 2, 3, 4, 5, 6), edges([1, 3], [2, 3], [3, 4], [3, 5]));
        const original = structuredClone(graph);
        expectValidOrder(graph, topologicalSort(graph));
        expectValidOrder(graph, topologicalSort(graph));
        expect(graph).toEqual(original);
    });

    test("empty graph", () => {
        const graph = buildGraph([], []);
        expectValidOrder(graph, topologicalSort(graph));
    });

    test("seeded random DAG of 500 tasks takes under one second", () => {
        let seed = 7919;
        const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
        const pairs = [];
        for (let i = 0; i < 500; i++) {
            for (let j = i + 1; j < 500; j++) if (random() < 0.035) pairs.push([i, j]);
        }
        const start = performance.now();
        const graph = buildGraph(tasks(...Array.from({ length: 500 }, (_, i) => i)), edges(...pairs));
        const result = topologicalSort(graph);
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(1000);
        expectValidOrder(graph, result);
    });

    test("handles a 20,000 task chain without a recursive call stack", () => {
        const rows = Array.from({ length: 20000 }, (_, id) => ({ id, duration_days: 1 }));
        const dependencies = rows.slice(1).map(({ id }) => ({ predecessor_task_id: id - 1, successor_task_id: id }));
        const result = topologicalSort(buildGraph(rows, dependencies));
        expect(result.order).toHaveLength(20000);
        expect(result.hasCycle).toBe(false);
    });

    test("database fields feed the existing CPM module including negative lag", () => {
        const graph = buildGraph(tasks(1, 2), [{
            predecessor_task_id: 1, successor_task_id: 2, dependency_type: "FS", lag_days: -1
        }]);
        const result = calculateForwardPass(topologicalSort(graph).sortedTasks);
        expect(result.get(1).ef).toBe(2);
        expect(result.get(2).es).toBe(1);
        expect(result.get(2).ef).toBe(3);
    });
});

describe("T-17 actual cycle membership", () => {
    test.each([
        ["two tasks", [1, 2], [[1, 2], [2, 1]], [1, 2]],
        ["four tasks", [1, 2, 3, 4], [[1, 2], [2, 3], [3, 4], [4, 1]], [1, 2, 3, 4]],
        ["downstream tail", [1, 2, 3, 4, 5, 6], [[1, 2], [2, 3], [3, 1], [3, 4], [4, 5], [6, 1]], [1, 2, 3]],
        ["bridge between cycles", [1, 2, 3, 4, 5], [[1, 2], [2, 1], [2, 3], [3, 4], [4, 5], [5, 4]], [1, 2, 4, 5]],
        ["self-loop defensive case", [1, 2], [[1, 1], [1, 2]], [1]]
    ])("%s", (_, ids, pairs, expected) => {
        const graph = buildGraph(tasks(...ids), edges(...pairs));
        const snapshot = structuredClone(graph);
        const result = topologicalSort(graph);
        expect(result.hasCycle).toBe(true);
        expect(new Set(result.cycleTasks)).toEqual(new Set(expected));
        expect(graph).toEqual(snapshot);
    });
});
