const { workingDate, addWorkingDays, countWorkingDaysInclusive: countWorkingDays } = require("../src/services/workingCalendar");
const { peakAssignments } = require("../src/services/projectOperationsService");
const scenarios = require("./data/cpm-scenarios.json");

test("working date handles Sunday start, holidays, duplicate exclusions and leap day", () => {
    const days = [1,2,3,4,5,6];
    expect(workingDate("2026-10-04", 0, days)).toBe("2026-10-05");
    expect(workingDate("2026-10-03", 2, days, ["2026-10-04", "2026-10-05", "2026-10-05"])).toBe("2026-10-07");
    expect(workingDate("2028-02-28", 2, days)).toBe("2028-03-01");
    expect(workingDate("2026-10-05", 4, [1])).toBe("2026-11-02");
    expect(workingDate(null, 0, days)).toBeNull();
    expect(workingDate("2026-10-05", 2147483649, days)).toBeNull();
});
test("calendar arithmetic agrees with day-by-day reference over varied weeks and holidays", () => {
    for (const days of [[1], [0,6], [1,2,3,4,5], [0,1,2,3,4,5,6]]) {
        const holidays = ["2026-10-03", "2026-10-05", "2026-10-18", "2026-12-25"];
        let index = -1;
        const cursor = new Date("2026-10-03T00:00:00Z");
        while (index < 100) {
            const day = cursor.toISOString().slice(0,10);
            if (days.includes(cursor.getUTCDay()) && !holidays.includes(day)) {
                index++;
                expect(workingDate("2026-10-03", index, days, holidays)).toBe(day);
            }
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
    }
});
test("overload counts actual simultaneous intervals, not all tasks touching the assigned task", () => {
    const task = { team_id: 1, es: 0, ef: 10 };
    const sequential = [0,2,4,6,8].map((es) => ({ team_id: 1, es, ef: es + 2 }));
    expect(peakAssignments([task, ...sequential], task)).toBe(2);
    expect(peakAssignments([task, ...Array.from({ length: 3 }, () => ({ team_id: 1, es: 3, ef: 6 }))], task)).toBe(4);
});

describe("T-39 (S-17): 6 ca tính tay cộng ngày làm việc và đổi thời lượng sang ngày lịch", () => {
    const calendarScenarios = scenarios.filter((s) => s.id.startsWith("CAL-"));

    test("đủ 6 ca tính tay từ tệp dữ liệu của T-22", () => {
        expect(calendarScenarios).toHaveLength(6);
    });

    test.each(calendarScenarios)("$id: $name", (scenario) => {
        expect(scenario.calculated_by).toEqual(expect.any(String));
        expect(scenario.calculated_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(scenario.manual_calculation.length).toBeGreaterThan(0);

        // Cộng thời lượng công việc (n ngày làm việc kể từ ngày bắt đầu)
        const finish = addWorkingDays(
            scenario.start_date,
            scenario.duration_days - 1,
            scenario.working_days,
            scenario.holidays
        );
        expect(finish).toBe(scenario.expected_finish);

        // Đếm số ngày làm việc giữa hai ngày
        const count = countWorkingDays(
            scenario.start_date,
            scenario.expected_finish,
            scenario.working_days,
            scenario.holidays
        );
        expect(count).toBe(scenario.expected_count);
    });

    test("AC T-39: sửa cố ý cách xử lý lễ trùng chủ nhật thì có ca đỏ", () => {
        const cal4 = calendarScenarios.find((s) => s.id === "CAL-04");
        expect(cal4).toBeDefined();

        // Thuật toán sai: trừ trùng cả ngày nghỉ hằng tuần lẫn ngày lễ khi lễ rơi vào chủ nhật
        function buggyAddWorkingDays(startDate, nDays, workingDays, holidays) {
            let res = addWorkingDays(startDate, nDays, workingDays, []);
            // Trừ thêm 1 ngày nếu có holiday rơi vào chủ nhật (sai lầm trừ trùng)
            const sunHoliday = holidays.find((h) => new Date(`${h}T00:00:00Z`).getUTCDay() === 0);
            if (sunHoliday) {
                res = addWorkingDays(res, 1, workingDays, []);
            }
            return res;
        }

        const buggyFinish = buggyAddWorkingDays(
            cal4.start_date,
            cal4.duration_days - 1,
            cal4.working_days,
            cal4.holidays
        );
        // Ca tính tay đúng là 2026-10-07, buggyFinish sẽ là 2026-10-08 -> đỏ!
        expect(buggyFinish).not.toBe(cal4.expected_finish);
    });
});
