const {
    calculateFS,
    calculateReverseFS,
    calculateSS,
    calculateReverseSS,
    calculateFF,
    calculateReverseFF,
    calculateSF,
    calculateReverseSF,
    calculateForwardPass,
    calculateBackwardPass,
    calculateSlackAndCriticalPath,
    calculateScheduleCPM
} = require("../src/services/cpmService");
const { buildGraph, topologicalSort } = require("../src/services/scheduleService");
const scenarios = require("./data/cpm-scenarios.json");

describe("S-08 & S-09 CPM Calculation Algorithm", () => {
    describe("Task T-18 (S-08): Công thức duyệt xuôi viết tách riêng cho từng loại quan hệ", () => {
        test("calculateFS: Khởi sớm dựa trên quan hệ Finish-to-Start (ES = EF_pred + lag)", () => {
            const pred = { es: 0, ef: 5 };
            expect(calculateFS(pred, 0)).toBe(5);
            expect(calculateFS(pred, 2)).toBe(7);
            expect(calculateFS(pred, -1)).toBe(4);
            // Hỗ trợ truyền số trực tiếp (mốc EF)
            expect(calculateFS(8, 3)).toBe(11);
        });

        test("calculateSS: Khởi sớm dựa trên quan hệ Start-to-Start (ES = ES_pred + lag)", () => {
            const pred = { es: 4, ef: 10 };
            expect(calculateSS(pred, 0)).toBe(4);
            expect(calculateSS(pred, 3)).toBe(7);
            expect(calculateSS(pred, -2)).toBe(2);
            // Hỗ trợ truyền số trực tiếp (mốc ES)
            expect(calculateSS(6, 2)).toBe(8);
        });

        test("calculateFF: Khởi sớm dựa trên quan hệ Finish-to-Finish (ES = EF_pred + lag - duration)", () => {
            const pred = { es: 0, ef: 10 };
            const duration = 4;
            expect(calculateFF(pred, 0, duration)).toBe(6);  // 10 + 0 - 4
            expect(calculateFF(pred, 2, duration)).toBe(8);  // 10 + 2 - 4
            expect(calculateFF(12, 1, 5)).toBe(8);           // 12 + 1 - 5
        });

        test("calculateSF: Khởi sớm dựa trên quan hệ Start-to-Finish (ES = ES_pred + lag - duration)", () => {
            const pred = { es: 10, ef: 15 };
            const duration = 3;
            expect(calculateSF(pred, 0, duration)).toBe(7);  // 10 + 0 - 3
            expect(calculateSF(pred, 4, duration)).toBe(11); // 10 + 4 - 3
            expect(calculateSF(8, 2, 4)).toBe(6);            // 8 + 2 - 4
        });
    });

    describe("Task T-20 (S-09): Các hàm ngược đối ứng đặt cạnh hàm xuôi", () => {
        test("calculateReverseFS: Kết muộn LF của việc trước (LF = LS_succ - lag)", () => {
            const succ = { ls: 10, lf: 15 };
            expect(calculateReverseFS(succ, 0)).toBe(10);
            expect(calculateReverseFS(succ, 2)).toBe(8);
        });

        test("calculateReverseSS: Khởi muộn LS của việc trước (LS = LS_succ - lag)", () => {
            const succ = { ls: 8, lf: 12 };
            expect(calculateReverseSS(succ, 0)).toBe(8);
            expect(calculateReverseSS(succ, 3)).toBe(5);
        });

        test("calculateReverseFF: Kết muộn LF của việc trước (LF = LF_succ - lag)", () => {
            const succ = { ls: 8, lf: 14 };
            expect(calculateReverseFF(succ, 0)).toBe(14);
            expect(calculateReverseFF(succ, 2)).toBe(12);
        });

        test("calculateReverseSF: Khởi muộn LS của việc trước (LS = LF_succ - lag)", () => {
            const succ = { ls: 8, lf: 15 };
            expect(calculateReverseSF(succ, 0)).toBe(15);
            expect(calculateReverseSF(succ, 3)).toBe(12);
        });
    });

    describe("Task T-19 (S-08): Duyệt xuôi theo thứ tự đã sắp và lưu hai mốc sớm", () => {
        test("công việc không có việc trước bắt đầu ở ngày 0 và lưu ES, EF", () => {
            const tasks = [
                { id: "A", duration: 4, dependencies: [] },
                { id: "B", duration: 3, dependencies: [] }
            ];
            const resultMap = calculateForwardPass(tasks);

            expect(resultMap.get("A").es).toBe(0);
            expect(resultMap.get("A").ef).toBe(4);
            expect(resultMap.get("B").es).toBe(0);
            expect(resultMap.get("B").ef).toBe(3);
        });

        test("lấy giá trị lớn nhất trong các ràng buộc từ việc trước", () => {
            const tasks = [
                { id: "A", duration: 5, dependencies: [] },
                { id: "B", duration: 8, dependencies: [] },
                {
                    id: "C",
                    duration: 4,
                    dependencies: [
                        { predecessorId: "A", type: "FS", lag: 0 }, // ES = 5
                        { predecessorId: "B", type: "FS", lag: 0 }  // ES = 8 -> Max = 8
                    ]
                }
            ];
            const resultMap = calculateForwardPass(tasks);

            expect(resultMap.get("C").es).toBe(8);
            expect(resultMap.get("C").ef).toBe(12);
        });
    });

    describe("Task T-20 & T-21 (S-09): Duyệt ngược và xác định đường găng", () => {
        test("duyệt ngược từ ngày hoàn thành và tính LF, LS, Slack, isCritical", () => {
            // Sơ đồ chuẩn:
            // A (dur 5) -> B (dur 3) -> D (dur 2)
            // A (dur 5) -> C (dur 7) -> D (dur 2)
            const tasks = [
                { id: "A", duration: 5, dependencies: [] },
                { id: "B", duration: 3, dependencies: [{ predecessorId: "A", type: "FS", lag: 0 }] },
                { id: "C", duration: 7, dependencies: [{ predecessorId: "A", type: "FS", lag: 0 }] },
                {
                    id: "D",
                    duration: 2,
                    dependencies: [
                        { predecessorId: "B", type: "FS", lag: 0 },
                        { predecessorId: "C", type: "FS", lag: 0 }
                    ]
                }
            ];

            const resultMap = new Map();
            calculateForwardPass(tasks, resultMap);
            calculateBackwardPass(tasks, resultMap);
            calculateSlackAndCriticalPath(resultMap);

            const result = resultMap;

            // Dự án kết thúc ở ngày 14
            // D: ES=12, EF=14, LF=14, LS=12, Slack=0, isCritical=true
            expect(result.get("D").slack).toBe(0);
            expect(result.get("D").isCritical).toBe(true);

            // C: ES=5, EF=12, LF=12, LS=5, Slack=0, isCritical=true
            expect(result.get("C").slack).toBe(0);
            expect(result.get("C").isCritical).toBe(true);

            // B: ES=5, EF=8, LF=12, LS=9, Slack=4, isCritical=false
            expect(result.get("B").slack).toBe(4);
            expect(result.get("B").isCritical).toBe(false);

            // A: ES=0, EF=5, LF=5, LS=0, Slack=0, isCritical=true
            expect(result.get("A").slack).toBe(0);
            expect(result.get("A").isCritical).toBe(true);
        });

        test("hai đường găng song song (parallel critical paths) đều được đánh dấu isCritical = true", () => {
            // Mạng có 2 nhánh song song độ dài bằng nhau:
            // Start -> Path 1: A (4) -> B (6) -> 10 ngày
            // Start -> Path 2: C (5) -> D (5) -> 10 ngày
            // Cả hai nhánh hội tụ về E (3)
            const tasks = [
                { id: "A", duration: 4, dependencies: [] },
                { id: "B", duration: 6, dependencies: [{ predecessorId: "A", type: "FS", lag: 0 }] },
                { id: "C", duration: 5, dependencies: [] },
                { id: "D", duration: 5, dependencies: [{ predecessorId: "C", type: "FS", lag: 0 }] },
                {
                    id: "E",
                    duration: 3,
                    dependencies: [
                        { predecessorId: "B", type: "FS", lag: 0 },
                        { predecessorId: "D", type: "FS", lag: 0 }
                    ]
                }
            ];

            const result = calculateScheduleCPM(tasks);

            // Tổng thời gian dự án: 10 + 3 = 13 ngày
            expect(result.get("E").es).toBe(10);
            expect(result.get("E").ef).toBe(13);
            expect(result.get("E").slack).toBe(0);
            expect(result.get("E").isCritical).toBe(true);

            // Nhánh 1 (A -> B) là đường găng
            expect(result.get("A").slack).toBe(0);
            expect(result.get("A").isCritical).toBe(true);
            expect(result.get("B").slack).toBe(0);
            expect(result.get("B").isCritical).toBe(true);

            // Nhánh 2 (C -> D) cũng là đường găng song song
            expect(result.get("C").slack).toBe(0);
            expect(result.get("C").isCritical).toBe(true);
            expect(result.get("D").slack).toBe(0);
            expect(result.get("D").isCritical).toBe(true);
        });
    });

    describe("T-22/T-23: đáp án tính tay từ file dữ liệu", () => {
        test.each(scenarios)("$id: $name", (scenario) => {
            expect(scenario.calculated_by).toEqual(expect.any(String));
            expect(scenario.calculated_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(scenario.manual_calculation.length).toBeGreaterThan(0);
            const graph = buildGraph(scenario.tasks, scenario.dependencies);
            const { hasCycle, sortedTasks } = topologicalSort(graph);
            expect(hasCycle).toBe(false);
            const result = calculateScheduleCPM(sortedTasks);
            expect(result.size).toBe(scenario.tasks.length);
            expect(new Set(scenario.expected.map((task) => task.id))).toEqual(new Set(result.keys()));
            for (const expected of scenario.expected) {
                const actual = result.get(expected.id);
                expect(actual).toBeDefined();
                expect(actual.es).toBe(expected.es);
                expect(actual.ef).toBe(expected.ef);
                expect(actual.ls).toBe(expected.ls);
                expect(actual.lf).toBe(expected.lf);
                expect(actual.slack).toBe(expected.slack);
                expect(actual.isCritical).toBe(expected.isCritical);
            }
        });

        test("hai mạng mới giữ đủ loại/lag âm và chênh lệch ba ngày", () => {
            const mixed = scenarios.find((scenario) => scenario.id === "K-02");
            expect(mixed.tasks.length).toBeGreaterThanOrEqual(6);
            expect(mixed.tasks.length).toBeLessThanOrEqual(8);
            expect(new Set(mixed.dependencies.map((edge) => edge.dependency_type))).toEqual(new Set(["FS", "SS", "FF", "SF"]));
            expect(mixed.dependencies.some((edge) => edge.lag_days < 0)).toBe(true);
            const parallel = scenarios.find((scenario) => scenario.id === "K-03");
            const result = calculateScheduleCPM(topologicalSort(buildGraph(parallel.tasks, parallel.dependencies)).sortedTasks);
            expect(result.get("B").ef - result.get("D").ef).toBe(3);
            expect(result.get("C").slack).toBe(3);
            expect(result.get("D").slack).toBe(3);
        });
    });

    describe("Task T-36 / S-16: Tính lại toàn mạng với mốc thực tế", () => {
        const k01 = scenarios.find((s) => s.id === "K-01");

        test("AC S-16 Ca 1: việc trên đường găng kết thúc thực tế trễ 3 ngày -> ngày hoàn thành dự án lùi đúng 3 ngày", () => {
            const actual01 = scenarios.find((s) => s.id === "K-01-ACTUAL-01");
            const graph = buildGraph(actual01.tasks, actual01.dependencies);
            const { sortedTasks } = topologicalSort(graph);
            const result = calculateScheduleCPM(sortedTasks);

            expect(result.summary.plannedFinish).toBe(15);
            expect(result.summary.currentFinish).toBe(18);
            expect(result.summary.delayDays).toBe(3);
            expect(result.get("F").ef).toBe(18);
            expect(result.get("A").ef).toBe(6);
        });

        test("AC S-16 Ca 2: việc không găng trễ trong độ trễ cho phép -> ngày hoàn thành dự án không đổi", () => {
            const actual02 = scenarios.find((s) => s.id === "K-01-ACTUAL-02");
            const graph = buildGraph(actual02.tasks, actual02.dependencies);
            const { sortedTasks } = topologicalSort(graph);
            const result = calculateScheduleCPM(sortedTasks);

            expect(result.summary.plannedFinish).toBe(15);
            expect(result.summary.currentFinish).toBe(15);
            expect(result.summary.delayDays).toBe(0);
        });

        test("AC S-16 Ca 3: việc không găng trễ nhiều hơn độ trễ cho phép -> việc đó trở thành găng và ngày hoàn thành lùi đúng phần vượt", () => {
            const actual03 = scenarios.find((s) => s.id === "K-01-ACTUAL-03");
            const graph = buildGraph(actual03.tasks, actual03.dependencies);
            const { sortedTasks } = topologicalSort(graph);
            const result = calculateScheduleCPM(sortedTasks);

            // C kế hoạch kết thúc 5, slack 1. Thực tế kết thúc 8 (vượt 2 ngày so với 5+1=6).
            // Dự án ban đầu 15 lùi đúng 2 ngày thành 17.
            expect(result.summary.plannedFinish).toBe(15);
            expect(result.summary.currentFinish).toBe(17);
            expect(result.summary.delayDays).toBe(2);

            // C và E trở thành găng
            expect(result.get("C").isCritical).toBe(true);
            expect(result.get("C").newlyCritical).toBe(true);
            expect(result.get("C").initiallyCritical).toBe(false);

            expect(result.get("E").isCritical).toBe(true);
            expect(result.get("E").newlyCritical).toBe(true);
            expect(result.get("E").initiallyCritical).toBe(false);

            // B và D không còn găng
            expect(result.get("B").isCritical).toBe(false);
            expect(result.get("D").isCritical).toBe(false);
        });

        test("AC S-16 Ca 4: việc đang làm chưa xong -> kết sớm lấy max(kế hoạch, hôm nay + phần còn lại)", () => {
            // Task B (kế hoạch ES=3, EF=7, duration=4).
            // Hôm nay = 6. B đã xong 50% -> phần còn lại = 2 ngày.
            // today + remaining = 6 + 2 = 8 > kế hoạch (7) -> EF(B) = 8.
            const inProgressTasks = k01.tasks.map((t) => t.id === "B"
                ? { ...t, actual_start: 3, progress_percent: 50 }
                : { ...t });
            const graph = buildGraph(inProgressTasks, k01.dependencies);
            const { sortedTasks } = topologicalSort(graph);
            const result = calculateScheduleCPM(sortedTasks, { today: 6 });

            expect(result.get("B").ef).toBe(8);
            // Kế hoạch là 7, nên dự án bị kéo dài từ 15 lên 16
            expect(result.summary.currentFinish).toBe(16);
            expect(result.summary.delayDays).toBe(1);
        });

        test("AC S-16: mạng 500 việc tính trong < 5 giây và không khoá giao diện (async)", async () => {
            const bigTasks = [];
            const bigDeps = [];
            const N = 500;
            for (let i = 1; i <= N; i++) {
                bigTasks.push({ id: `T${i}`, name: `Task ${i}`, duration_days: 2 });
                if (i > 1) {
                    bigDeps.push({ predecessor_task_id: `T${i - 1}`, successor_task_id: `T${i}`, dependency_type: "FS", lag_days: 0 });
                }
            }
            const graph = buildGraph(bigTasks, bigDeps);
            const { sortedTasks } = topologicalSort(graph);
            expect(sortedTasks).toHaveLength(500);

            const start = Date.now();
            const { calculateScheduleCPMAsync } = require("../src/services/cpmService");
            const result = await calculateScheduleCPMAsync(sortedTasks);
            const elapsed = Date.now() - start;

            expect(elapsed).toBeLessThan(5000);
            expect(result.size).toBe(500);
            expect(result.get("T500").ef).toBe(1000);
        });
    });

    describe("Task T-37 / S-16: Báo chênh lệch và đánh dấu việc mới trở thành găng", () => {
        test("báo trễ một việc găng 3 ngày thì summary có delayDays = 3", () => {
            const actual01 = scenarios.find((s) => s.id === "K-01-ACTUAL-01");
            const result = calculateScheduleCPM(topologicalSort(buildGraph(actual01.tasks, actual01.dependencies)).sortedTasks);
            expect(result.summary.delayDays).toBe(3);
        });

        test("việc mới trở thành găng có cờ newlyCritical = true phân biệt với việc găng từ đầu", () => {
            const actual03 = scenarios.find((s) => s.id === "K-01-ACTUAL-03");
            const result = calculateScheduleCPM(topologicalSort(buildGraph(actual03.tasks, actual03.dependencies)).sortedTasks);

            // A găng từ đầu
            expect(result.get("F").isCritical).toBe(true);
            expect(result.get("F").initiallyCritical).toBe(true);
            expect(result.get("F").newlyCritical).toBe(false);

            // C mới trở thành găng
            expect(result.get("C").isCritical).toBe(true);
            expect(result.get("C").initiallyCritical).toBe(false);
            expect(result.get("C").newlyCritical).toBe(true);
        });
    });

    describe("Task T-40 / S-17: Tính lại tiến độ theo lịch", () => {
        test("việc 6 ngày bắt đầu thứ năm kết thúc thứ tư tuần sau; thêm 1 ngày lễ lùi 1 ngày", () => {
            const singleTask = [{ id: "A", name: "Công việc 6 ngày", duration_days: 6 }];
            const graph = buildGraph(singleTask, []);
            const { sortedTasks } = topologicalSort(graph);

            // Lịch 6 ngày/tuần, bắt đầu thứ năm 2026-10-01
            const res1 = calculateScheduleCPM(sortedTasks, {
                calendar: {
                    startDate: "2026-10-01",
                    workingDays: [1, 2, 3, 4, 5, 6],
                    holidays: []
                }
            });
            // Kết thúc ở ngày thứ tư 2026-10-07
            const { addWorkingDays } = require("../src/services/workingCalendar");
            const finish1 = addWorkingDays("2026-10-01", res1.get("A").ef - 1, [1, 2, 3, 4, 5, 6], []);
            expect(finish1).toBe("2026-10-07");

            // Thêm 1 ngày lễ 2026-10-02 (thứ sáu) -> lùi 1 ngày thành 2026-10-08
            const finish2 = addWorkingDays("2026-10-01", res1.get("A").ef - 1, [1, 2, 3, 4, 5, 6], ["2026-10-02"]);
            expect(finish2).toBe("2026-10-08");
        });
    });
});
