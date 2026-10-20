const { createTaskService } = require("../src/services/taskService");
const { buildGraph, topologicalSort } = require("../src/services/scheduleService");
const { calculateScheduleCPMAsync } = require("../src/services/cpmService");
const { createLargeTaskFixture, createInMemoryTaskModel } = require("../scripts/lib/local-ac-fixtures.cjs");

// Wall-clock acceptance measurements belong to the opt-in probe, not CI gates.
test("S-11 rejects a candidate closing a 500-task cycle before persistence and names the complete waits-for chain", async () => {
    const fixture = createLargeTaskFixture();
    const snapshot = structuredClone(fixture);
    const { model, calls } = createInMemoryTaskModel(fixture);
    let error;
    try {
        await createTaskService({ model }).addDependency(37, fixture.invalid.successorId, fixture.invalid.body);
    } catch (caught) { error = caught; }
    expect(fixture.dependencies).toHaveLength(1999);
    expect(error).toMatchObject({ status: 422, expose: true });
    expect(error.cycle.map(task => task.id)).toEqual([1, ...Array.from({ length: 499 }, (_, index) => 500 - index)]);
    for (const task of error.cycle) expect(error.message).toContain(task.name);
    expect(error.message).toContain('"Công việc 002" lại chờ "Công việc 001"');
    expect(calls).toEqual({ taskReads: 1, dependencyReads: 1, writes: 0 });
    expect(fixture).toEqual(snapshot);
});

test("S-11 saves a valid 2,000th edge on a 500-task graph without changing the source graph", async () => {
    const fixture = createLargeTaskFixture();
    const snapshot = structuredClone(fixture);
    const { model, calls } = createInMemoryTaskModel(fixture);
    const result = await createTaskService({ model }).addDependency(37, fixture.valid.successorId, fixture.valid.body);
    expect(result).toMatchObject({ predecessor_task_id: 1, successor_task_id: 500, dependency_type: "FS", lag_days: 0 });
    expect(calls).toEqual({ taskReads: 1, dependencyReads: 1, writes: 1 });
    expect(fixture).toEqual(snapshot);
});

test("S-16 recalculates a 500-task, 2,000-edge graph with a known three-day critical delay in memory", async () => {
    const fixture = createLargeTaskFixture();
    const candidate = { successor_task_id: fixture.valid.successorId, ...fixture.valid.body };
    fixture.tasks[0].actual_start = 0;
    fixture.tasks[0].actual_finish = 4;
    fixture.tasks[0].progress_percent = 100;
    const graph = buildGraph(fixture.tasks, [...fixture.dependencies, candidate]);
    const ordered = topologicalSort(graph);
    expect(ordered.hasCycle).toBe(false);
    const result = await calculateScheduleCPMAsync(ordered.sortedTasks, { today: 4 });
    expect(result.size).toBe(500);
    expect(result.summary).toEqual({ plannedFinish: 500, currentFinish: 503, delayDays: 3 });
    expect(result.get(500)).toMatchObject({ plannedEf: 500, ef: 503, isCritical: true });
});
