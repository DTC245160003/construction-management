import test from "node:test";
import assert from "node:assert/strict";
import { decimalDifference, decimalLabel, outlineRows, reportTiming } from "../src/features/finance/viewModel.js";

test("acceptance period preview keeps four decimal places and correction signs exact", () => {
  assert.equal(decimalDifference("0.3", "0.1"), "0.2000");
  assert.equal(decimalDifference("9007199254740993.0001", "9007199254740992.9999"), "0.0002");
  assert.equal(decimalDifference("7.125", "10.5"), "-3.3750");
  assert.equal(decimalLabel("-3.3750"), "-3,375");
  assert.equal(decimalDifference("", "10"), null);
  assert.equal(decimalDifference("1.00001", "0"), null);
});

test("contract outline includes parents and each leaf once at the correct depth", () => {
  const rows = outlineRows([{ id: 3, parent_id: 2 }, { id: 1, parent_id: null }, { id: 2, parent_id: 1 }]);
  assert.deepEqual(rows.map(({ id, depth }) => [id, depth]), [[1, 0], [2, 1], [3, 2]]);
  assert.equal(outlineRows([{ id: 1, parent_id: 2 }, { id: 2, parent_id: 1 }]).length, 2);
});

test("owner report uses the original baseline and server working-day variance", () => {
  assert.deepEqual(reportTiming({ baseline_finish: "2026-10-05", current_finish: "2026-10-12", planned_finish: "2026-10-12", finish_variance_days: 6 }), {
    baseline: "2026-10-05", current: "2026-10-12", variance: 6,
  });
  assert.equal(reportTiming({ planned_finish: "2026-10-12", current_finish: "2026-10-12" }).baseline, null);
});
