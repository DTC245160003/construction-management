/**
 * Module Thuật toán CPM (Critical Path Method) - Quản lý tiến độ dự án
 * 
 * Thực hiện 4 nhiệm vụ theo chuẩn nghiệp vụ:
 * - T-18 (S-08): Công thức duyệt xuôi viết tách riêng cho từng loại quan hệ (FS, SS, FF, SF)
 * - T-19 (S-08): Duyệt xuôi theo thứ tự topo đã sắp và lưu hai mốc sớm (ES, EF)
 * - T-20 (S-09): Duyệt ngược theo thứ tự đảo và lưu hai mốc muộn (LF, LS) kèm 4 hàm ngược đối ứng
 * - T-21 (S-09): Tính độ trễ cho phép (Slack = LS - ES) và đánh dấu việc găng (isCritical)
 */

// =============================================================================
// TASK T-18 & HÀM ĐỐI ỨNG T-20: CÁC HÀM TÍNH TOÁN RÀNG BUỘC RIÊNG BIỆT
// =============================================================================

/**
 * T-18: Khởi sớm dựa trên quan hệ Finish-to-Start (FS).
 * Công việc sau bắt đầu sau khi công việc trước kết thúc cộng độ trễ (lag).
 * ES(sau) >= EF(trước) + lag
 *
 * @param {Object|number} predecessor - Công việc trước (chứa ef) hoặc giá trị ef trực tiếp
 * @param {number} [lag=0] - Độ trễ thời gian (ngày)
 * @returns {number} Mốc thời gian khởi sớm ứng với ràng buộc FS
 */
function calculateFS(predecessor, lag = 0) {
    const ef = typeof predecessor === "number" ? predecessor : Number(predecessor?.ef || 0);
    return ef + (Number(lag) || 0);
}

/**
 * T-20 (Đối ứng calculateFS): Kết muộn của công việc trước dựa trên quan hệ FS với việc sau.
 * LF(trước) <= LS(sau) - lag
 *
 * @param {Object|number} successor - Công việc sau (chứa ls) hoặc giá trị ls trực tiếp
 * @param {number} [lag=0] - Độ trễ thời gian (ngày)
 * @returns {number} Mốc thời gian kết muộn (LF) của việc trước
 */
function calculateReverseFS(successor, lag = 0) {
    const ls = typeof successor === "number" ? successor : Number(successor?.ls || 0);
    return ls - (Number(lag) || 0);
}

/**
 * T-18: Khởi sớm dựa trên quan hệ Start-to-Start (SS).
 * Công việc sau bắt đầu sau khi công việc trước bắt đầu cộng độ trễ (lag).
 * ES(sau) >= ES(trước) + lag
 *
 * @param {Object|number} predecessor - Công việc trước (chứa es) hoặc giá trị es trực tiếp
 * @param {number} [lag=0] - Độ trễ thời gian (ngày)
 * @returns {number} Mốc thời gian khởi sớm ứng với ràng buộc SS
 */
function calculateSS(predecessor, lag = 0) {
    const es = typeof predecessor === "number" ? predecessor : Number(predecessor?.es || 0);
    return es + (Number(lag) || 0);
}

/**
 * T-20 (Đối ứng calculateSS): Khởi muộn của công việc trước dựa trên quan hệ SS với việc sau.
 * ES(sau) >= ES(trước) + lag => LS(trước) <= LS(sau) - lag => LF(trước) = LS(trước) + duration(trước)
 * Trả về mốc Khởi muộn LS(trước) tối đa cho phép.
 *
 * @param {Object|number} successor - Công việc sau (chứa ls) hoặc giá trị ls trực tiếp
 * @param {number} [lag=0] - Độ trễ thời gian (ngày)
 * @returns {number} Mốc thời gian khởi muộn (LS) của việc trước
 */
function calculateReverseSS(successor, lag = 0) {
    const ls = typeof successor === "number" ? successor : Number(successor?.ls || 0);
    return ls - (Number(lag) || 0);
}

/**
 * T-18: Khởi sớm dựa trên quan hệ Finish-to-Finish (FF).
 * Công việc sau kết thúc sau khi công việc trước kết thúc cộng độ trễ (lag).
 * EF(sau) >= EF(trước) + lag => ES(sau) >= EF(trước) + lag - duration
 *
 * @param {Object|number} predecessor - Công việc trước (chứa ef) hoặc giá trị ef trực tiếp
 * @param {number} [lag=0] - Độ trễ thời gian (ngày)
 * @param {number} [duration=0] - Thời lượng của công việc hiện tại (sau)
 * @returns {number} Mốc thời gian khởi sớm ứng với ràng buộc FF
 */
function calculateFF(predecessor, lag = 0, duration = 0) {
    const ef = typeof predecessor === "number" ? predecessor : Number(predecessor?.ef || 0);
    return ef + (Number(lag) || 0) - (Number(duration) || 0);
}

/**
 * T-20 (Đối ứng calculateFF): Kết muộn của công việc trước dựa trên quan hệ FF với việc sau.
 * EF(sau) >= EF(trước) + lag => LF(trước) <= LF(sau) - lag
 *
 * @param {Object|number} successor - Công việc sau (chứa lf) hoặc giá trị lf trực tiếp
 * @param {number} [lag=0] - Độ trễ thời gian (ngày)
 * @returns {number} Mốc thời gian kết muộn (LF) của việc trước
 */
function calculateReverseFF(successor, lag = 0) {
    const lf = typeof successor === "number" ? successor : Number(successor?.lf || 0);
    return lf - (Number(lag) || 0);
}

/**
 * T-18: Khởi sớm dựa trên quan hệ Start-to-Finish (SF).
 * Công việc sau kết thúc sau khi công việc trước bắt đầu cộng độ trễ (lag).
 * EF(sau) >= ES(trước) + lag => ES(sau) >= ES(trước) + lag - duration
 *
 * @param {Object|number} predecessor - Công việc trước (chứa es) hoặc giá trị es trực tiếp
 * @param {number} [lag=0] - Độ trễ thời gian (ngày)
 * @param {number} [duration=0] - Thời lượng của công việc hiện tại (sau)
 * @returns {number} Mốc thời gian khởi sớm ứng với ràng buộc SF
 */
function calculateSF(predecessor, lag = 0, duration = 0) {
    const es = typeof predecessor === "number" ? predecessor : Number(predecessor?.es || 0);
    return es + (Number(lag) || 0) - (Number(duration) || 0);
}

/**
 * T-20 (Đối ứng calculateSF): Khởi muộn của công việc trước dựa trên quan hệ SF với việc sau.
 * EF(sau) >= ES(trước) + lag => LS(trước) <= LF(sau) - lag
 *
 * @param {Object|number} successor - Công việc sau (chứa lf) hoặc giá trị lf trực tiếp
 * @param {number} [lag=0] - Độ trễ thời gian (ngày)
 * @returns {number} Mốc thời gian khởi muộn (LS) của việc trước
 */
function calculateReverseSF(successor, lag = 0) {
    const lf = typeof successor === "number" ? successor : Number(successor?.lf || 0);
    return lf - (Number(lag) || 0);
}


// =============================================================================
// TASK T-19: DUYỆT XUÔI THEO THỨ TỰ SẮP XẾP TOPO VÀ LƯU 2 MỐC SỚM (ES, EF)
// =============================================================================

/**
 * Tính mốc khởi sớm theo ràng buộc phụ thuộc bằng cách gọi đúng 4 hàm riêng ở T-18.
 *
 * @param {Object} predecessor - Dữ liệu công việc trước
 * @param {Object} dependency - { type: 'FS'|'SS'|'FF'|'SF', lag: number }
 * @param {number} duration - Thời lượng công việc hiện tại
 * @returns {number} Mốc khởi sớm theo ràng buộc này
 */
function calculatePredecessorConstraint(predecessor, dependency = {}, duration = 0) {
    const lag = Number(dependency.lag) || 0;
    const type = (dependency.type || "FS").toUpperCase();

    switch (type) {
        case "FS":
            return calculateFS(predecessor, lag);
        case "SS":
            return calculateSS(predecessor, lag);
        case "FF":
            return calculateFF(predecessor, lag, duration);
        case "SF":
            return calculateSF(predecessor, lag, duration);
        default:
            return calculateFS(predecessor, lag);
    }
}

/**
 * Task T-19 (S-08):
 * - Lần lượt đi theo thứ tự topo của T-16.
 * - Với mỗi việc, lấy giá trị lớn nhất trong các ràng buộc từ việc trước (sử dụng đúng 4 hàm riêng ở T-18).
 * - Việc không có việc trước thì bắt đầu ở ngày khởi công dự án (mặc định ngày 0).
 * - Cộng thời lượng ra Kết sớm (EF = ES + Duration). Lưu 2 mốc ES, EF vào cấu trúc kết quả.
 *
 * @param {Array<Object>} sortedTasks - Danh sách công việc theo thứ tự topo T-16
 * @param {Map<any, Object>} [resultMap] - Cấu trúc dữ liệu lưu kết quả trong bộ nhớ
 * @param {Object} [options] - Tùy chọn { projectStartDate: 0 }
 * @returns {Map<any, Object>} Kết quả với { es, ef } cho từng công việc
 */
function calculateForwardPass(sortedTasks, resultMap = new Map(), options = {}) {
    const projectStartDate = Number(options.projectStartDate) || 0;

    for (const task of sortedTasks) {
        const taskId = task.id;
        const duration = Number(task.duration) || 0;
        const dependencies = Array.isArray(task.dependencies)
            ? task.dependencies
            : (Array.isArray(task.predecessors) ? task.predecessors : []);

        let maxEarlyStart = projectStartDate;

        if (dependencies.length > 0) {
            let currentMax = -Infinity;
            let hasValidConstraint = false;

            for (const dep of dependencies) {
                const predId = dep.predecessorId ?? dep.id ?? (typeof dep === "number" || typeof dep === "string" ? dep : null);
                const predecessor = resultMap.get(predId);

                if (predecessor) {
                    const earlyStartConstraint = calculatePredecessorConstraint(
                        predecessor,
                        typeof dep === "object" ? dep : {},
                        duration
                    );
                    if (earlyStartConstraint > currentMax) {
                        currentMax = earlyStartConstraint;
                    }
                    hasValidConstraint = true;
                }
            }

            if (hasValidConstraint) {
                maxEarlyStart = Math.max(projectStartDate, currentMax);
            }
        }

        let es = Math.round(maxEarlyStart);
        let ef = Math.round(es + duration);

        if (!options.ignoreActuals) {
            const actualFinish = task.actual_finish != null ? Number(task.actual_finish) : null;
            const actualStart = task.actual_start != null ? Number(task.actual_start) : null;
            const progressPercent = task.progress_percent != null ? Number(task.progress_percent) : null;

            if (actualFinish != null && Number.isFinite(actualFinish)) {
                ef = Math.round(actualFinish);
                es = actualStart != null && Number.isFinite(actualStart)
                    ? Math.round(actualStart)
                    : Math.max(Math.round(maxEarlyStart), Math.round(ef - duration));
            } else if (actualStart != null && Number.isFinite(actualStart)) {
                es = Math.round(actualStart);
                let remaining = duration;
                if (task.remaining_days != null) {
                    remaining = Number(task.remaining_days);
                } else if (progressPercent != null && progressPercent >= 0 && progressPercent <= 100) {
                    remaining = Math.ceil(duration * (1 - progressPercent / 100));
                }
                const today = Number(options.today) || 0;
                const forecastEf = Math.round(today + remaining);
                ef = Math.max(Math.round(es + duration), forecastEf);
            } else if (progressPercent != null && progressPercent > 0 && progressPercent < 100) {
                const remaining = task.remaining_days != null
                    ? Number(task.remaining_days)
                    : Math.ceil(duration * (1 - progressPercent / 100));
                const today = Number(options.today) || 0;
                const forecastEf = Math.round(today + remaining);
                ef = Math.max(ef, forecastEf);
            }
        }

        const record = resultMap.get(taskId) || { ...task };
        record.id = taskId;
        record.duration = duration;
        record.es = es;
        record.ef = ef;

        resultMap.set(taskId, record);
    }

    return resultMap;
}


// =============================================================================
// TASK T-20: DUYỆT NGƯỢC THEO THỨ TỰ ĐẢO VÀ LƯU 2 MỐC MUỘN (LF, LS)
// =============================================================================

/**
 * Tính mốc kết muộn (LF) tối đa cho phép của công việc trước dựa trên yêu cầu muộn của công việc sau,
 * sử dụng 4 hàm ngược đối ứng (calculateReverseFS, calculateReverseSS, calculateReverseFF, calculateReverseSF).
 *
 * @param {Object} successor - Dữ liệu công việc kế tiếp (chứa ls, lf)
 * @param {Object} dependency - { type: 'FS'|'SS'|'FF'|'SF', lag: number }
 * @param {number} predecessorDuration - Thời lượng của công việc trước (predecessor)
 * @returns {number} Mốc LF tối đa cho phép của công việc trước
 */
function calculateSuccessorConstraint(successor, dependency = {}, predecessorDuration = 0) {
    const lag = Number(dependency.lag) || 0;
    const type = (dependency.type || "FS").toUpperCase();

    switch (type) {
        case "FS":
            return calculateReverseFS(successor, lag);
        case "SS":
            // calculateReverseSS trả về LS(trước) => LF(trước) = LS(trước) + predecessorDuration
            return calculateReverseSS(successor, lag) + predecessorDuration;
        case "FF":
            return calculateReverseFF(successor, lag);
        case "SF":
            // calculateReverseSF trả về LS(trước) => LF(trước) = LS(trước) + predecessorDuration
            return calculateReverseSF(successor, lag) + predecessorDuration;
        default:
            return calculateReverseFS(successor, lag);
    }
}

/**
 * Task T-20 (S-09):
 * - Duyệt ngược theo thứ tự đảo của thứ tự topo, xuất phát từ ngày hoàn thành dự án.
 * - Với mỗi việc, lấy giá trị nhỏ nhất từ các ràng buộc việc sau để làm mốc Kết muộn (LF).
 * - Trừ thời lượng ra Khởi muộn (LS = LF - Duration). Lưu 2 mốc LF, LS vào cấu trúc kết quả.
 *
 * @param {Array<Object>} sortedTasks - Danh sách công việc theo thứ tự topo xuôi
 * @param {Map<any, Object>} resultMap - Kết quả từ Forward Pass đã có es, ef
 * @param {Object} [options] - Tùy chọn { projectFinishDate }
 * @returns {Map<any, Object>} Kết quả bổ sung ls, lf cho từng công việc
 */
function calculateBackwardPass(sortedTasks, resultMap, options = {}) {
    if (!resultMap || resultMap.size === 0) {
        throw new Error("resultMap phải chứa kết quả ES, EF từ Forward Pass trước khi tính Backward Pass");
    }

    // Ngày hoàn thành dự án: mặc định là max(EF)
    let projectFinishDate = typeof options.projectFinishDate === "number" ? options.projectFinishDate : null;
    if (projectFinishDate === null) {
        let maxEf = 0;
        for (const record of resultMap.values()) {
            if (typeof record.ef === "number" && record.ef > maxEf) {
                maxEf = record.ef;
            }
        }
        projectFinishDate = maxEf;
    }

    // Xây dựng danh sách successors (công việc sau) cho từng việc
    const successorsMap = new Map();
    for (const task of sortedTasks) {
        const taskId = task.id;
        if (!successorsMap.has(taskId)) {
            successorsMap.set(taskId, []);
        }

        const dependencies = Array.isArray(task.dependencies)
            ? task.dependencies
            : (Array.isArray(task.predecessors) ? task.predecessors : []);

        for (const dep of dependencies) {
            const predId = dep.predecessorId ?? dep.id ?? (typeof dep === "number" || typeof dep === "string" ? dep : null);
            if (predId !== null && predId !== undefined) {
                if (!successorsMap.has(predId)) {
                    successorsMap.set(predId, []);
                }
                successorsMap.get(predId).push({
                    successorId: taskId,
                    type: dep.type || "FS",
                    lag: Number(dep.lag) || 0
                });
            }
        }
    }

    // Duyệt ngược danh sách topo
    for (let i = sortedTasks.length - 1; i >= 0; i--) {
        const task = sortedTasks[i];
        const taskId = task.id;
        const record = resultMap.get(taskId);
        if (!record) continue;

        const duration = Number(record.duration ?? task.duration) || 0;
        const successors = successorsMap.get(taskId) || [];

        let minLateFinish = projectFinishDate;

        if (successors.length > 0) {
            let currentMin = Infinity;
            let hasValidConstraint = false;

            for (const succ of successors) {
                const succResult = resultMap.get(succ.successorId);
                if (succResult && typeof succResult.ls === "number") {
                    const lfConstraint = calculateSuccessorConstraint(
                        succResult,
                        succ,
                        duration
                    );
                    if (lfConstraint < currentMin) {
                        currentMin = lfConstraint;
                    }
                    hasValidConstraint = true;
                }
            }

            if (hasValidConstraint) {
                minLateFinish = currentMin;
            }
        }

        let lf = Math.round(minLateFinish);
        if (!options.ignoreActuals && task.actual_finish != null && Number.isFinite(Number(task.actual_finish))) {
            lf = Math.min(lf, Math.round(Number(task.actual_finish)));
        }
        const effectiveDuration = record.ef - record.es;
        const ls = Math.round(lf - effectiveDuration);

        record.lf = lf;
        record.ls = ls;
        resultMap.set(taskId, record);
    }

    return resultMap;
}


// =============================================================================
// TASK T-21: TÍNH ĐỘ TRỄ CHO PHÉP VÀ ĐÁNH DẤU VIỆC GĂNG (ISCRITICAL)
// =============================================================================

/**
 * Task T-21 (S-09):
 * - Độ trễ cho phép = Khởi muộn - Khởi sớm (Slack = LS - ES). So sánh bằng 0 trên số nguyên ngày.
 * - Việc có độ trễ bằng 0 là việc găng (đánh dấu cờ isCritical = true).
 * - Nếu mạng có hai đường găng song song thì cả hai đều được đánh dấu cờ găng.
 *
 * @param {Map<any, Object>} resultMap - Kết quả đã có es, ef, ls, lf
 * @returns {Map<any, Object>} Kết quả bổ sung { slack, isCritical }
 */
function calculateSlackAndCriticalPath(resultMap) {
    for (const [taskId, record] of resultMap.entries()) {
        const es = Math.round(Number(record.es) || 0);
        const ls = Math.round(Number(record.ls) || 0);

        // Slack (Total Float) = LS - ES trên số nguyên ngày
        const slack = Math.round(ls - es);
        const isCritical = (slack === 0);

        record.slack = slack;
        record.isCritical = isCritical;

        resultMap.set(taskId, record);
    }

    return resultMap;
}

/**
 * Tổng hợp toàn bộ quy trình tính toán tiến độ CPM (T-18, T-19, T-20, T-21)
 *
 * @param {Array<Object>} sortedTasks - Danh sách công việc đã sắp theo topo T-16
 * @param {Object} [options] - Tuỳ chọn { projectStartDate, projectFinishDate }
 * @returns {Map<any, Object>} Map kết quả đầy đủ
 */
function calculateScheduleCPM(sortedTasks, options = {}) {
    const hasActuals = !options.ignoreActuals && sortedTasks.some(
        (t) => t.actual_finish != null || t.actual_start != null || (t.progress_percent != null && t.progress_percent > 0)
    );

    let baselineResultMap = null;
    let plannedFinish = 0;

    if (hasActuals) {
        baselineResultMap = new Map();
        calculateForwardPass(sortedTasks, baselineResultMap, { ...options, ignoreActuals: true });
        calculateBackwardPass(sortedTasks, baselineResultMap, { ...options, ignoreActuals: true });
        calculateSlackAndCriticalPath(baselineResultMap);
        for (const record of baselineResultMap.values()) {
            if (record.ef > plannedFinish) plannedFinish = record.ef;
        }
    }

    const resultMap = new Map();
    calculateForwardPass(sortedTasks, resultMap, options);
    calculateBackwardPass(sortedTasks, resultMap, options);
    calculateSlackAndCriticalPath(resultMap);

    let currentFinish = 0;
    for (const record of resultMap.values()) {
        if (record.ef > currentFinish) currentFinish = record.ef;
    }

    if (!hasActuals) {
        plannedFinish = currentFinish;
    }

    for (const [taskId, record] of resultMap.entries()) {
        const initiallyCritical = baselineResultMap
            ? Boolean(baselineResultMap.get(taskId)?.isCritical)
            : record.isCritical;
        const newlyCritical = !initiallyCritical && record.isCritical;

        record.initiallyCritical = initiallyCritical;
        record.newlyCritical = newlyCritical;
        record.plannedEf = baselineResultMap ? (baselineResultMap.get(taskId)?.ef ?? record.ef) : record.ef;

        if (options.calendar && options.calendar.startDate) {
            const { workingDate } = require("./workingCalendar");
            const { startDate, workingDays, holidays } = options.calendar;
            record.es_date = workingDate(startDate, record.es, workingDays, holidays);
            record.ef_date = workingDate(startDate, record.ef, workingDays, holidays);
            record.ls_date = workingDate(startDate, record.ls, workingDays, holidays);
            record.lf_date = workingDate(startDate, record.lf, workingDays, holidays);
        }
    }

    resultMap.summary = {
        plannedFinish,
        currentFinish,
        delayDays: currentFinish - plannedFinish
    };

    return resultMap;
}

async function calculateScheduleCPMAsync(sortedTasks, options = {}) {
    return new Promise((resolve, reject) => {
        setImmediate(() => {
            try { resolve(calculateScheduleCPM(sortedTasks, options)); }
            catch (error) { reject(error); }
        });
    });
}

module.exports = {
    calculateFS,
    calculateReverseFS,
    calculateSS,
    calculateReverseSS,
    calculateFF,
    calculateReverseFF,
    calculateSF,
    calculateReverseSF,
    calculatePredecessorConstraint,
    calculateSuccessorConstraint,
    calculateForwardPass,
    calculateBackwardPass,
    calculateSlackAndCriticalPath,
    calculateScheduleCPM,
    calculateScheduleCPMAsync
};
