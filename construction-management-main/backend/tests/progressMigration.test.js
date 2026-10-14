const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(path.join(__dirname, "../src/migrations/015_add_task_actuals.sql"), "utf8");
const rollback = fs.readFileSync(path.join(__dirname, "../src/migrations/015_add_task_actuals.down.sql"), "utf8");

test("T-34 migration declares actual progress columns and safe constraints", () => {
    expect(migration).toMatch(/actual_start\s+DATE/);
    expect(migration).toMatch(/actual_finish\s+DATE/);
    expect(migration).toMatch(/progress_percent\s+INTEGER\s+DEFAULT 0/);
    expect(migration).toMatch(/progress_percent >= 0 AND progress_percent <= 100/);
    expect(migration).toMatch(/actual_finish >= actual_start/);
    expect(rollback).toMatch(/DROP CONSTRAINT tasks_actual_dates_check/);
    expect(rollback).toMatch(/DROP CONSTRAINT tasks_progress_percent_check/);
    expect(rollback).toMatch(/Cannot rollback task actuals/);
    for (const column of ["actual_start", "actual_finish", "progress_percent"]) {
        expect(rollback).toMatch(new RegExp(`DROP COLUMN ${column}`));
    }
});
