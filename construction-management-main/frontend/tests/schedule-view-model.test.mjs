import assert from "node:assert/strict";
import test from "node:test";
import { toBarModel } from "../src/features/gantt/barModel.js";
import { barGeometry } from "../src/features/gantt/barGeometry.js";
import { createTimeScale } from "../src/features/gantt/timeScale.js";
import { calendarValue, dayForDate, dateForDay, filterTasks, ganttRows, scheduleKpis, todayDate, viewStatus } from "../src/features/gantt/scheduleViewModel.js";

test("presentation metrics preserve CPM input and use weighted actual progress", () => {
    const source = [
        { id: 1, name: "Đào móng", es: 0, ef: 2, ls: 0, lf: 2, slack: 0, isCritical: true, duration_days: 2, percentComplete: 100 },
        { id: 2, name: "Bê tông", es: 2, ef: 8, ls: 3, lf: 9, slack: 1, duration_days: 6, percentComplete: 0 }
    ];
    const snapshot = structuredClone(source);
    const tasks = source.map(toBarModel);
    assert.deepEqual(scheduleKpis(tasks, null), { progress: 25, completed: 1, total: 2, risk: null, critical: 1 });
    assert.deepEqual(source, snapshot);
    assert.equal(viewStatus(tasks[1], 9), "late");
    assert.equal(viewStatus(tasks[1], 5), "risk");
    assert.equal(viewStatus(tasks[1], null), "todo");
});

test("T-31 clips partially visible intervals but hides invalid/outside intervals", () => {
    const scale = createTimeScale({ start: 10, end: 20, width: 1000 });
    assert.deepEqual(barGeometry({ es: 0, ef: 12 }, scale), { left: 0, right: 200 });
    assert.deepEqual(barGeometry({ es: 18, ef: 30 }, scale), { left: 800, right: 1000 });
    for (const task of [{ es: null, ef: null }, { es: 16, ef: 14 }, { es: 0, ef: 4 }, { es: 21, ef: 30 }, { es: 20, ef: 21 }, { es: 0, ef: 10 }]) {
        assert.equal(barGeometry(task, scale), null);
    }
    assert.deepEqual(barGeometry({ es: 20, ef: 20, isMilestone: true }, scale), { left: 1000, right: 1000 });
    assert.equal(barGeometry({ es: 9, ef: 9, isMilestone: true }, scale), null);
});

test("unknown progress is never represented as a made-up KPI", () => {
    const metrics = scheduleKpis([toBarModel({ id: 1, name: "Unknown", es: 0, ef: 3 })], null);
    assert.equal(metrics.progress, null);
    assert.equal(metrics.completed, null);
    assert.equal(metrics.risk, null);
});

test("API date-only and serialized Date values populate the same Vietnam calendar day", () => {
    for (const actualStart of ["2026-10-04", "2026-10-03T17:00:00.000Z", new Date("2026-10-03T17:00:00Z")]) {
        assert.equal(toBarModel({ id: 1, actualStart }).actualStart, "2026-10-04");
    }
    assert.equal(toBarModel({ id: 1, actualStart: "bad-date" }).actualStart, null);
});

test("upstream task actuals and newly critical metadata adapt to the Gantt model", () => {
    const task = toBarModel({
        id: 2, name: "Bê tông", actual_start: "2026-10-01", actual_finish: "2026-10-03",
        progress_percent: 45, initiallyCritical: false, newlyCritical: true, plannedEf: 8
    });
    assert.equal(task.actualStart, "2026-10-01");
    assert.equal(task.actualEnd, "2026-10-03");
    assert.equal(task.percentComplete, 45);
    assert.equal(task.newlyCritical, true);
    assert.equal(task.initiallyCritical, false);
    assert.equal(task.plannedEf, 8);
});

test("calendar projection honors leap days and Vietnam today without changing relative offsets", () => {
    assert.equal(dayForDate("2024-03-01", "2024-02-28"), 2);
    assert.equal(dateForDay("2024-02-28", 2), "2024-03-01");
    assert.equal(calendarValue("2024-02-30"), null);
    assert.equal(todayDate(new Date("2026-10-05T18:00:00Z")), "2026-10-06");
});

test("accent-insensitive filters and collapsed groups keep critical flags intact", () => {
    const tasks = [{ id: 1, name: "Đào móng", work_item_id: 2, isCritical: true, percentComplete: 100 }, { id: 2, name: "Bê tông", work_item_id: 2, percentComplete: 10 }].map(toBarModel);
    assert.deepEqual(filterTasks(tasks, { search: "dao mong", criticalOnly: true }, null).map((task) => task.id), [1]);
    const items = [{ id: 1, title: "Công trình", parent_id: null }, { id: 2, title: "Móng", parent_id: 1 }];
    assert.equal(ganttRows(tasks, items)[0].group.name, "Công trình / Móng");
    assert.equal(ganttRows(tasks, items, ["2"]).length, 1);
});
