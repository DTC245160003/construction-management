const DAY_MS = 86400000;

export const STATUS_LABELS = Object.freeze({
    todo: "Chưa bắt đầu", active: "Đang thực hiện", complete: "Hoàn thành",
    risk: "Có nguy cơ trễ", late: "Trễ"
});

export function calendarValue(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(0, 0, 0, 0);
    return year > 0 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
        ? date.getTime() : null;
}

export function todayDate(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en", {
        timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(now);
    const get = (type) => parts.find((part) => part.type === type).value;
    return `${get("year")}-${get("month")}-${get("day")}`;
}

export function calendarDate(value) {
    if (calendarValue(value) !== null) return value;
    // PostgreSQL DATE may reach the browser as a serialized Date. Interpret the
    // instant in the project's Vietnam timezone instead of truncating UTC text.
    if (!(value instanceof Date) && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value))) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? todayDate(date) : null;
}

export function dayForDate(value, origin) {
    const date = calendarValue(value);
    const start = calendarValue(origin);
    return date === null || start === null ? null : (date - start) / DAY_MS;
}

export function dateForDay(origin, day) {
    const start = calendarValue(origin);
    if (start === null || !Number.isFinite(day)) return null;
    return new Date(start + day * DAY_MS).toISOString().slice(0, 10);
}

export function formatDate(value) {
    if (calendarValue(value) === null) return "—";
    return value.split("-").reverse().join("/");
}

export function formatPlanDay(value, origin) {
    if (!Number.isFinite(value)) return "—";
    return origin ? formatDate(dateForDay(origin, value)) : `Ngày ${value.toLocaleString("vi-VN")}`;
}

export function viewStatus(task, today = null) {
    if (task.percentComplete === 100) return "complete";
    const explicit = {
        completed: "complete", done: "complete", in_progress: "active", doing: "active",
        delayed: "late", overdue: "late", at_risk: "risk", not_started: "todo"
    }[task.status] || (Object.hasOwn(STATUS_LABELS, task.status) ? task.status : null);
    if (explicit) return explicit;
    // These are presentation indicators. Never change the task's stored status or CPM values.
    const es = task.displayEs ?? task.es;
    const ef = task.displayEf ?? task.ef;
    if (today !== null && task.percentComplete !== null && ef !== null) {
        if (task.displayEf != null ? today >= ef : today > ef) return "late";
        if (es !== null && ef > es && today > es) {
            const expected = Math.min(100, ((today - es) / (ef - es)) * 100);
            if (task.percentComplete < expected) return "risk";
        }
    }
    return (task.percentComplete ?? 0) > 0 || task.actualStart ? "active" : "todo";
}

export function scheduleKpis(tasks, today) {
    const known = tasks.every((task) => task.percentComplete !== null);
    const totalWeight = tasks.reduce((sum, task) => sum + Math.max(1, task.duration ?? 1), 0);
    return {
        progress: tasks.length && known ? Math.round(tasks.reduce((sum, task) =>
            sum + task.percentComplete * Math.max(1, task.duration ?? 1), 0) / totalWeight) : null,
        completed: tasks.length && !tasks.some((task) => task.percentComplete !== null) ? null : tasks.filter((task) => task.percentComplete === 100).length,
        total: tasks.length,
        risk: (today !== null && tasks.some((task) => task.percentComplete !== null)) || tasks.some((task) => ["risk", "late"].includes(viewStatus(task)))
            ? tasks.filter((task) => ["risk", "late"].includes(viewStatus(task, today))).length : null,
        critical: tasks.filter((task) => task.isCritical).length
    };
}

export function scheduleRange(tasks) {
    const points = tasks.flatMap((task) => [task.displayEs ?? task.es, task.displayEf ?? task.ef,
        task.baselineDisplayEs ?? task.baselineEs, task.baselineDisplayEf ?? task.baselineEf,
        task.actualDisplayEs, task.actualDisplayEf]).filter(Number.isFinite);
    const start = Math.min(0, ...points);
    return { start, end: Math.max(start + 1, ...points) };
}

export function ganttRows(tasks, items, collapsed = []) {
    const itemMap = new Map(items.map((item) => [String(item.id), item]));
    if (!tasks.some((task) => itemMap.has(String(task.workItemId)))) return tasks.map((bar) => ({ bar }));
    const groups = new Map();
    for (const bar of tasks) {
        const id = String(bar.workItemId ?? "unassigned");
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(bar);
    }
    return [...groups].flatMap(([id, children]) => {
        const item = itemMap.get(id);
        const names = [];
        const visited = new Set();
        let ancestor = item;
        while (ancestor && !visited.has(String(ancestor.id))) {
            visited.add(String(ancestor.id));
            names.unshift(ancestor.title);
            ancestor = itemMap.get(String(ancestor.parent_id));
        }
        return [{ group: { id, name: names.join(" / ") || "Chưa có hạng mục", count: children.length } },
            ...(collapsed.includes(id) ? [] : children.map((bar) => ({ bar })))];
    });
}

export function filterTasks(tasks, { search = "", status = "all", assignee = "all", criticalOnly = false } = {}, today) {
    const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll("đ", "d").replaceAll("Đ", "D").toLowerCase();
    const term = normalize(search.trim());
    return tasks.filter((task) => (!term || normalize(task.name).includes(term))
        && (status === "all" || viewStatus(task, today) === status)
        && (assignee === "all" || task.assignee === assignee)
        && (!criticalOnly || task.isCritical));
}
