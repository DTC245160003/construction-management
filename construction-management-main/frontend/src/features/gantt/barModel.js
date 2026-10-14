import { calendarDate } from "./scheduleViewModel.js";

function nullableNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function nullableDate(value) {
    if (value === null || value === undefined || value === "") return null;
    return calendarDate(value);
}

export function toBarModel(task) {
    if (!task || task.id === undefined || task.id === null) throw new TypeError("A task id is required");
    return {
        id: task.id,
        name: String(task.name ?? ""),
        es: nullableNumber(task.es),
        ef: nullableNumber(task.ef),
        ls: nullableNumber(task.ls),
        lf: nullableNumber(task.lf),
        displayEs: nullableNumber(task.displayEs), displayEf: nullableNumber(task.displayEf),
        plannedStartDate: task.plannedStartDate ?? null, plannedFinishDate: task.plannedFinishDate ?? null,
        baselineEs: nullableNumber(task.baselineEs ?? task.baseline_es),
        baselineEf: nullableNumber(task.baselineEf ?? task.baseline_ef),
        baselineDisplayEs: nullableNumber(task.baselineDisplayEs), baselineDisplayEf: nullableNumber(task.baselineDisplayEf),
        actualDisplayEs: nullableNumber(task.actualDisplayEs), actualDisplayEf: nullableNumber(task.actualDisplayEf),
        totalFloat: nullableNumber(task.totalFloat ?? task.total_float ?? task.slack),
        isCritical: task.isCritical === true || task.is_critical === true
            || task.isCritical === "true" || task.is_critical === "true",
        initiallyCritical: task.initiallyCritical === true || task.initially_critical === true,
        newlyCritical: task.newlyCritical === true || task.newly_critical === true,
        plannedEf: nullableNumber(task.plannedEf ?? task.planned_early_finish),
        actualStart: nullableDate(task.actualStart ?? task.actual_start ?? task.actual_start_date),
        actualEnd: nullableDate(task.actualEnd ?? task.actual_finish ?? task.actual_end_date),
        percentComplete: nullableNumber(task.percentComplete ?? task.progress_percent ?? task.percent_complete),
        duration: nullableNumber(task.duration_days ?? task.duration ?? (Number.isFinite(task.ef) && Number.isFinite(task.es) ? task.ef - task.es : null)),
        workItemId: task.work_item_id ?? task.workItemId ?? null,
        assignee: task.assignee_name ?? (typeof task.assignee === "string" ? task.assignee : task.assignee?.name) ?? task.assigned_to_name ?? null,
        status: task.status ?? null,
        isMilestone: task.is_milestone === true || task.isMilestone === true || task.type === "milestone"
            || (task.es !== null && task.es !== undefined && task.es === task.ef)
    };
}

export function adaptScheduleToBars(tasks = []) {
    if (!Array.isArray(tasks)) throw new TypeError("Schedule data must be an array");
    return tasks.map(toBarModel);
}

export const scheduleToBars = adaptScheduleToBars;
