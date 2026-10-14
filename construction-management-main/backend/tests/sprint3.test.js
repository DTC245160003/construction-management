const { countWorkingDays } = require("../src/services/workingCalendar");
const { traceCriticalPath, createScheduleService } = require("../src/services/scheduleService");

describe("Sprint 3: T-41 to T-45 Unit Tests", () => {
    describe("T-44 & T-39: countWorkingDays and workingDate", () => {
        test("calculates working days correctly over standard 6-day week without holidays", () => {
            const workingDays = [1, 2, 3, 4, 5, 6]; // Mon-Sat
            // 2026-10-05 is Monday, 2026-10-10 is Saturday (5 days difference: Tue, Wed, Thu, Fri, Sat = 5 days)
            const count = countWorkingDays("2026-10-05", "2026-10-10", workingDays, []);
            expect(count).toBe(5);
        });

        test("skips Sundays and holidays when counting overdue working days", () => {
            const workingDays = [1, 2, 3, 4, 5, 6];
            // 2026-10-03 (Sat) to 2026-10-06 (Tue): 2026-10-04 is Sun (skipped).
            // If 2026-10-05 (Mon) is a holiday: only 2026-10-06 is counted -> 1 working day
            const count = countWorkingDays("2026-10-03", "2026-10-06", workingDays, ["2026-10-05"]);
            expect(count).toBe(1);
        });

        test("returns 0 if toDate <= fromDate", () => {
            const workingDays = [1, 2, 3, 4, 5];
            expect(countWorkingDays("2026-10-10", "2026-10-10", workingDays, [])).toBe(0);
            expect(countWorkingDays("2026-10-10", "2026-10-05", workingDays, [])).toBe(0);
        });
    });

    describe("T-45: traceCriticalPath", () => {
        test("reconstructs sequence of critical task names from end task back to start", () => {
            const allTasks = [
                { id: 1, name: "Khởi công / Ép cọc", es: 0, ef: 5, isCritical: true },
                { id: 2, name: "Đào đất móng", es: 5, ef: 10, isCritical: true },
                { id: 3, name: "Đổ bê tông lót", es: 10, ef: 12, isCritical: true },
                { id: 4, name: "Lắp đặt cốt thép móng", es: 12, ef: 18, isCritical: true },
                { id: 5, name: "Công việc phụ song song", es: 0, ef: 3, isCritical: false }
            ];

            const dependencies = [
                { predecessor_task_id: 1, successor_task_id: 2 },
                { predecessor_task_id: 2, successor_task_id: 3 },
                { predecessor_task_id: 3, successor_task_id: 4 },
                { predecessor_task_id: 1, successor_task_id: 5 }
            ];

            const path = traceCriticalPath(4, allTasks, dependencies);
            expect(path).toEqual([
                "Khởi công / Ép cọc",
                "Đào đất móng",
                "Đổ bê tông lót",
                "Lắp đặt cốt thép móng"
            ]);
        });
    });

    describe("T-41: Baseline service flow", () => {
        test("delegates saveBaseline to model within a project transaction", async () => {
            const mockSaveBaseline = jest.fn().mockResolvedValue([
                { id: 1, project_id: 10, task_id: 1, early_start: 0, early_finish: 5 }
            ]);
            const mockModel = {
                withProjectTransaction: jest.fn(async (projectId, fn) => {
                    return fn({
                        saveBaseline: mockSaveBaseline,
                        replaceResults: jest.fn(),
                        listMilestones: jest.fn().mockResolvedValue([])
                    }, { schedule_needs_recalc: false });
                })
            };

            const service = createScheduleService({ model: mockModel });
            const result = await service.saveBaseline(10, 1);
            expect(mockModel.withProjectTransaction).toHaveBeenCalledWith(10, expect.any(Function));
            expect(mockSaveBaseline).toHaveBeenCalledWith(10, 1);
            expect(result).toHaveLength(1);
        });
    });

    describe("T-43: Milestone management service", () => {
        test("creates milestone and lists them via transaction", async () => {
            const mockCreateMilestone = jest.fn().mockResolvedValue({
                id: 1,
                project_id: 10,
                work_item_id: 5,
                name: "Mốc nghiệm thu móng",
                target_date: "2026-11-01"
            });
            const mockListMilestones = jest.fn().mockResolvedValue([
                { id: 1, name: "Mốc nghiệm thu móng", target_date: "2026-11-01" }
            ]);

            const mockModel = {
                withProjectTransaction: jest.fn(async (projectId, fn) => {
                    return fn({
                        createMilestone: mockCreateMilestone,
                        listMilestones: mockListMilestones,
                        getProjectCalendarInfo: jest.fn().mockResolvedValue({
                            project: { start_date: "2026-10-01" },
                            calendar: { working_days: [1,2,3,4,5,6] },
                            holidays: []
                        }),
                        listResults: jest.fn().mockResolvedValue([]),
                        syncMilestoneAlert: jest.fn().mockResolvedValue(),
                        tasks: { listDependencies: jest.fn().mockResolvedValue([]) },
                        pool: { query: jest.fn().mockResolvedValue({ rows: [] }) }
                    }, { schedule_needs_recalc: false });
                })
            };

            const service = createScheduleService({ model: mockModel });
            const milestone = await service.createMilestone(10, 1, {
                work_item_id: 5,
                name: "Mốc nghiệm thu móng",
                target_date: "2026-11-01"
            });
            expect(milestone.name).toBe("Mốc nghiệm thu móng");

            const list = await service.listMilestones(10);
            expect(list).toHaveLength(1);
        });
    });
});
