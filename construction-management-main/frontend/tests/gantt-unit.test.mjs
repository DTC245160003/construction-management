import assert from "node:assert/strict";
import test from "node:test";
import { createTimeScale } from "../src/features/gantt/timeScale.js";

test("date-only scale keeps calendar labels and leap day independent of local timezone", () => {
    const scale = createTimeScale({
        startDate: "2024-02-28",
        endDate: "2024-03-02",
        width: 300
    });

    assert.equal(scale.timeToX("2024-02-28"), 0);
    assert.equal(scale.timeToX("2024-02-29"), 100);
    assert.deepEqual(scale.ticks.map((tick) => tick.label), ["28/02", "29/02", "01/03", "02/03"]);
});

test("week ticks use seven calendar days and numeric day offsets remain compatible", () => {
    const scale = createTimeScale({ startDate: "2024-01-01", endDate: "2024-01-22", width: 210, unit: "week" });
    assert.equal(scale.timeToX("2024-01-08"), 70);
    assert.deepEqual(scale.ticks.map((tick) => tick.value), [0, 7, 14, 21]);
    assert.deepEqual(scale.ticks.map((tick) => tick.label), ["Tuần 1", "Tuần 2", "Tuần 3", "Tuần 4"]);
});

test("three hand-calculated milestones map to expected horizontal coordinates", () => {
    const scale = createTimeScale({ start: 0, end: 14, width: 700 });
    assert.deepEqual([0, 7, 14].map(scale.timeToX), [0, 350, 700]);
});

test("date origin remains compatible with numeric day ranges", () => {
    const scale = createTimeScale({ startDate: "2024-01-01", end: 10, width: 100 });
    assert.equal(scale.timeToX("2024-01-06"), 50);
});

test("invalid date ranges and invalid scale options are rejected", () => {
    assert.throws(() => createTimeScale({ startDate: "2024-02-30", endDate: "2024-03-02" }), RangeError);
    assert.throws(() => createTimeScale({ startDate: "2024-02-28", endDate: "2024-02-30" }), RangeError);
    assert.throws(() => createTimeScale({ startDate: "2024-02-28", endDate: "bad-date" }), RangeError);
    assert.throws(() => createTimeScale({ startDate: "bad-start", endDate: "bad-end" }), RangeError);
    assert.throws(() => createTimeScale({ start: 4, end: 4 }), RangeError);
    assert.throws(() => createTimeScale({ start: 0, end: 1, unit: "year" }), RangeError);
});

test("calendar months follow variable month lengths and preserve CPM coordinates", () => {
    const month = createTimeScale({ start: 0, end: 65, originDate: "2024-01-28", unit: "month", width: 650 });
    assert.deepEqual(month.ticks.map((tick) => tick.value), [0, 4, 33, 64]);
    assert.deepEqual(month.ticks.map((tick) => tick.label), ["Tháng 1/2024", "Tháng 2/2024", "Tháng 3/2024", "Tháng 4/2024"]);
    assert.equal(month.timeToX(33), 330);
    assert.equal(month.timeToX("2024-03-01"), 330);
});

test("mutating the source Date does not change an existing time scale", () => {
    const startDate = new Date("2024-01-01T00:00:00Z");
    const scale = createTimeScale({ startDate, endDate: "2024-01-11", width: 100 });
    const before = scale.timeToX("2024-01-06");
    const ticks = scale.ticks;

    startDate.setUTCDate(2);

    assert.equal(scale.timeToX("2024-01-06"), before);
    assert.equal(scale.ticks, ticks);
});
