import test from "node:test";
import assert from "node:assert/strict";
import { projectTaskCalendar, workingDate, nonWorkingDays } from "../src/features/gantt/projectCalendar.js";
import { toBarModel } from "../src/features/gantt/barModel.js";
import { scheduleRange } from "../src/features/gantt/scheduleViewModel.js";
const calendar = { working_days: [1,2,3,4,5,6], holidays: [{ day: "2026-10-02" }] };
test("six working days from Thursday skip Sunday and the project holiday", () => {
    assert.equal(workingDate("2026-10-01",5,calendar.working_days,[]),"2026-10-07");
    assert.equal(workingDate("2026-10-01",5,calendar.working_days,["2026-10-02"]),"2026-10-08");
    assert.deepEqual(nonWorkingDays("2026-10-01",0,8,calendar),[1,3]);
});
test("calendar, baseline and actual layers survive repeated bar adaptation without changing CPM", () => {
    const raw = { id:1, es:0, ef:6, ls:0, lf:6, baseline_es:0, baseline_ef:3, duration_days:6,
        actual_start:"2026-10-01",actual_finish:"2026-10-09",progress_percent:100 };
    const projected = toBarModel(projectTaskCalendar(toBarModel(raw),"2026-10-01",calendar));
    assert.equal(projected.es,0); assert.equal(projected.ef,6);
    assert.equal(projected.plannedFinishDate,"2026-10-08");
    assert.equal(projected.displayEf,8); assert.equal(projected.baselineDisplayEf,5);
    assert.equal(projected.actualDisplayEf,9); assert.equal(projected.percentComplete,100);
    assert.deepEqual(scheduleRange([projected]),{start:0,end:9});
    assert.equal(raw.ef,6);
});
test("unknown project calendar preserves relative offsets and never invents actual dates", () => {
    const bar=toBarModel({id:1,es:2,ef:4});
    assert.equal(projectTaskCalendar(bar,null,null),bar);
    assert.equal(workingDate("2026-10-01",2,[]),null);
    assert.equal(workingDate("2026-10-01",2147483647,[1]),null);
});
