import { calendarDate, calendarValue, dateForDay, dayForDate } from "./scheduleViewModel.js";

const DAY = 86400000;
export function workingDate(origin, offset, workingDays, holidays = []) {
    if (calendarValue(origin) === null || !Number.isSafeInteger(offset) || offset < 0 || !workingDays?.length) return null;
    const start = calendarValue(origin) / DAY;
    const weekday = day => ((day + 4) % 7 + 7) % 7;
    const days = new Set(workingDays);
    const excluded = [...new Set(holidays.map(day => calendarValue(day) / DAY))].filter(day => day >= start && days.has(weekday(day)));
    const count = end => {
        const span = end - start + 1;
        let total = Math.floor(span / 7) * days.size;
        for (let index = 0; index < span % 7; index++) if (days.has(weekday(start + index))) total++;
        return total - excluded.filter(day => day <= end).length;
    };
    let low = start;
    let high = Math.min(calendarValue("9999-12-31") / DAY, start + Math.ceil((offset + excluded.length + 1) / days.size) * 7);
    if (count(high) < offset + 1) return null;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (count(middle) >= offset + 1) high = middle;
        else low = middle + 1;
    }
    return new Date(low * DAY).toISOString().slice(0, 10);
}

// Render working-day CPM offsets on a calendar axis without changing ES/EF.
export function projectTaskCalendar(task, origin, calendar) {
    if (!origin || !calendar?.working_days?.length) return task;
    const holidays = (calendar.holidays || []).map(day => typeof day === "string" ? day : day.day);
    const at = value => workingDate(origin, value, calendar.working_days, holidays);
    const start = at(task.es);
    const finish = at(task.ef === task.es ? task.ef : task.ef - 1);
    const baselineStart = at(task.baselineEs);
    const baselineFinish = at(task.baselineEf === task.baselineEs ? task.baselineEf : task.baselineEf - 1);
    return { ...task, plannedStartDate: start, plannedFinishDate: finish,
        displayEs: dayForDate(start, origin), displayEf: finish ? dayForDate(finish, origin) + (task.isMilestone ? 0 : 1) : null,
        baselineDisplayEs: dayForDate(baselineStart, origin), baselineDisplayEf: baselineFinish ? dayForDate(baselineFinish, origin) + 1 : null,
        actualDisplayEs: dayForDate(calendarDate(task.actualStart), origin),
        actualDisplayEf: task.actualEnd ? dayForDate(calendarDate(task.actualEnd), origin) + 1 : null
    };
}

export function nonWorkingDays(origin, start, end, calendar) {
    if (!origin || !calendar?.working_days?.length) return [];
    const holidays = new Set((calendar.holidays || []).map(day => typeof day === "string" ? day : day.day));
    const result = [];
    // Very long horizons use relative mode instead of creating millions of nodes.
    if (end - start > 36600) return result;
    for (let day = Math.floor(start); day < end; day++) {
        const date = dateForDay(origin, day);
        if (holidays.has(date) || !calendar.working_days.includes(new Date(calendarValue(date)).getUTCDay())) result.push(day);
    }
    return result;
}
