// Explicit local acceptance probe. No DB, network, device, or persisted app data.
// Run separately from Jest: host scheduling makes strict performance CI flaky.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { performance, monitorEventLoopDelay } = require("node:perf_hooks");
const { createTaskService } = require("../src/services/taskService");
const { buildGraph, topologicalSort } = require("../src/services/scheduleService");
const { calculateScheduleCPMAsync } = require("../src/services/cpmService");
const { createLargeTaskFixture, createInMemoryTaskModel } = require("./lib/local-ac-fixtures.cjs");

const round = value => Number(value.toFixed(3));
function statistics(samples) {
    const sorted = [...samples].sort((a, b) => a - b);
    return {
        iterations: samples.length, minMs: round(sorted[0]),
        medianMs: round(sorted[Math.ceil(sorted.length * 0.5) - 1]),
        p95Ms: round(sorted[Math.ceil(sorted.length * 0.95) - 1]),
        maxMs: round(sorted.at(-1)), meanMs: round(samples.reduce((sum, value) => sum + value, 0) / samples.length)
    };
}

async function measure(operation, verify, iterations = 100) {
    for (let iteration = 0; iteration < 10; iteration++) verify(await operation());
    const samples = [];
    for (let iteration = 0; iteration < iterations; iteration++) {
        const start = performance.now();
        const result = await operation();
        samples.push(performance.now() - start);
        verify(result);
    }
    return statistics(samples);
}

async function main() {
    const fixture = createLargeTaskFixture();
    const inputBefore = JSON.stringify(fixture);
    const invalid = createInMemoryTaskModel(fixture);
    const invalidService = createTaskService({ model: invalid.model });
    const valid = createInMemoryTaskModel(fixture);
    const validService = createTaskService({ model: valid.model });
    const rejected = await measure(async () => {
        try {
            await invalidService.addDependency(37, fixture.invalid.successorId, fixture.invalid.body);
        } catch (error) { return error; }
        throw new Error("Expected cycle rejection");
    }, error => {
        assert.equal(error.status, 422);
        assert.equal(error.cycle.length, 500);
        assert.equal(error.cycle[0].id, 1);
        for (let index = 1; index < 500; index++) assert.equal(error.cycle[index].id, 501 - index);
        for (const task of error.cycle) assert.ok(error.message.includes(task.name));
    });
    assert.equal(invalid.calls.writes, 0);
    const accepted = await measure(
        () => validService.addDependency(37, fixture.valid.successorId, fixture.valid.body),
        result => { assert.equal(result.predecessor_task_id, 1); assert.equal(result.successor_task_id, 500); }
    );
    assert.equal(valid.calls.writes, 110);
    assert.equal(JSON.stringify(fixture), inputBefore);

    const scheduleFixture = createLargeTaskFixture();
    scheduleFixture.tasks[0].actual_start = 0;
    scheduleFixture.tasks[0].actual_finish = 4;
    scheduleFixture.tasks[0].progress_percent = 100;
    const candidate = { successor_task_id: scheduleFixture.valid.successorId, ...scheduleFixture.valid.body };
    const eventLoop = monitorEventLoopDelay({ resolution: 1 });
    eventLoop.enable();
    const recalculation = await measure(async () => {
        // Include rebuilding/topological ordering, not only the CPM function.
        const graph = buildGraph(scheduleFixture.tasks, [...scheduleFixture.dependencies, candidate]);
        const sorted = topologicalSort(graph);
        assert.equal(sorted.hasCycle, false);
        return calculateScheduleCPMAsync(sorted.sortedTasks, { today: 4 });
    }, result => {
        assert.equal(result.size, 500);
        assert.deepEqual(result.summary, { plannedFinish: 500, currentFinish: 503, delayDays: 3 });
    });
    eventLoop.disable();
    const cpus = os.cpus();
    const stories = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../docs/integration/audit-original-stories.json"), "utf8"));
    const s11 = stories.stories.find(story => story.id === "S-11");
    const s16 = stories.stories.find(story => story.id === "S-16");
    const report = {
        generatedAt: new Date().toISOString(),
        command: "node backend/scripts/check-local-ac-performance.cjs",
        source: { file: "docs/integration/audit-original-stories.json", sha256: stories.sourceSha256 },
        environment: {
            node: process.version, platform: process.platform, release: os.release(), architecture: process.arch,
            cpu: cpus[0]?.model, logicalCpus: cpus.length, totalMemoryGiB: round(os.totalmem() / 1024 ** 3)
        },
        fixture: { tasks: 500, existingEdges: 1999, edgesWithCandidate: 2000, chain: "1 -> 2 -> ... -> 500", edgeType: "FS", durationDays: 1 },
        methodology: {
            warmupIterationsPerCase: 10, measuredIterationsPerCase: 100, timer: "node:perf_hooks performance.now()",
            scope: "Imported production services with an in-memory transaction adapter; timings exclude fixture allocation, assertion work, module loading, real DB, HTTP and UI rendering.",
            s11Includes: "addDependency validation, reading arrays from async in-memory adapter, candidate graph construction, cycle detection and full 500-name error construction (invalid) or stub persistence (valid).",
            s16Includes: "Graph construction, topological ordering, asynchronous CPM scheduling and full planned/actual forward/backward calculation for a three-day critical delay."
        },
        s11: {
            sourceRange: s11.sourceRange, requirement: s11.nfr, thresholdMs: 500,
            invalidCandidate: rejected, validCandidate: accepted,
            invalidPersistenceCalls: invalid.calls.writes, namedCycleTasks: 500,
            result: Math.max(rejected.maxMs, accepted.maxMs) < 500 ? "PASS_LOCAL" : "FAIL_LOCAL",
            limitations: ["Measurements apply only to this host/runtime, not Samsung hardware or production load.", "No claim about real DB transaction or HTTP duration."]
        },
        s16: {
            sourceRange: s16.sourceRange, requirement: s16.ac.split("\n").at(-1), nfr: s16.nfr, thresholdMs: 5000,
            inMemoryRecalculation: recalculation,
            backendEventLoopObservedMaxDelayMs: round(eventLoop.max / 1e6),
            expectedSummary: { plannedFinish: 500, currentFinish: 503, delayDays: 3 },
            computeResult: recalculation.maxMs < 5000 ? "PASS_LOCAL_COMPUTE_ONLY" : "FAIL_LOCAL_COMPUTE",
            acceptanceResult: "PARTIAL",
            limitations: ["No browser render, device responsiveness or real DB/HTTP timings were measured.", "setImmediate defers CPM work; calculation itself remains synchronous on the backend event loop.", "The complete S-16 UI-within-five-seconds and no-freeze acceptance still needs browser/device evidence."]
        },
        safety: { databaseConnections: 0, networkRequests: 0, deviceOperations: 0, migrations: 0, productionCodeChanges: 0 }
    };
    const output = path.resolve(__dirname, "../../docs/integration/connectivity/local-ac-performance.json");
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({ output, s11: report.s11.result, rejected, accepted, s16Compute: report.s16.computeResult, s16Acceptance: report.s16.acceptanceResult, recalculation }, null, 2)}\n`);
    if (report.s11.result !== "PASS_LOCAL" || report.s16.computeResult !== "PASS_LOCAL_COMPUTE_ONLY") process.exitCode = 1;
}

if (require.main === module) main().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
