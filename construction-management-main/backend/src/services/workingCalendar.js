const DAY = 86400000;
const ordinal = (day) => Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY);
const weekday = (number) => ((number + 4) % 7 + 7) % 7;

// CPM offsets and lags remain integer working days. Convert them to calendar
// dates at the boundary, preserving the existing forward/backward CPM engine.
function workingDate(startDate, offset, workingDays, holidays = []) {
    if (!startDate || !Number.isSafeInteger(offset) || offset < 0 || !workingDays.length) return null;
    const start = ordinal(startDate);
    if (!Number.isFinite(start)) return null;
    const days = new Set(workingDays);
    const excluded = [...new Set(holidays.map(ordinal))].filter((day) => day >= start && days.has(weekday(day)));
    const count = (end) => {
        const span = end - start + 1;
        let total = Math.floor(span / 7) * days.size;
        for (let i = 0; i < span % 7; i++) if (days.has(weekday(start + i))) total++;
        return total - excluded.filter((day) => day <= end).length;
    };
    let low = start;
    let high = Math.min(ordinal("9999-12-31"), start + Math.ceil((offset + excluded.length + 1) / days.size) * 7);
    if (count(high) < offset + 1) return null;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (count(middle) >= offset + 1) high = middle;
        else low = middle + 1;
    }
    return new Date(low * DAY).toISOString().slice(0, 10);
}

function addWorkingDays(startDate, nDays, workingDays = [1, 2, 3, 4, 5, 6], holidays = []) {
    if (!startDate || !workingDays?.length) return null;
    const n = Number(nDays) || 0;
    const days = new Set(workingDays);
    const excluded = new Set(holidays.map(ordinal).filter((d) => days.has(weekday(d))));
    let curr = ordinal(startDate);
    if (!Number.isFinite(curr)) return null;

    // Advance to next valid working day if startDate is a rest/holiday day
    if (n >= 0) {
        while (!days.has(weekday(curr)) || excluded.has(curr)) {
            curr++;
        }
        let remaining = n;
        while (remaining > 0) {
            curr++;
            if (days.has(weekday(curr)) && !excluded.has(curr)) {
                remaining--;
            }
        }
    } else {
        while (!days.has(weekday(curr)) || excluded.has(curr)) {
            curr--;
        }
        let remaining = -n;
        while (remaining > 0) {
            curr--;
            if (days.has(weekday(curr)) && !excluded.has(curr)) {
                remaining--;
            }
        }
    }
    return new Date(curr * DAY).toISOString().slice(0, 10);
}

function countWorkingDaysInclusive(startDate, endDate, workingDays = [1, 2, 3, 4, 5, 6], holidays = []) {
    if (!startDate || !endDate || !workingDays?.length) return 0;
    const start = ordinal(startDate);
    const end = ordinal(endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
    if (start > end) return -countWorkingDaysInclusive(endDate, startDate, workingDays, holidays);

    const days = new Set(workingDays);
    const excluded = new Set(holidays.map(ordinal).filter((d) => days.has(weekday(d))));
    let count = 0;
    for (let d = start; d <= end; d++) {
        if (days.has(weekday(d)) && !excluded.has(d)) {
            count++;
        }
    }
    return count;
}

function countWorkingDays(fromDate, toDate, workingDays, holidays = []) {
    if (!fromDate || !toDate || !workingDays?.length) return 0;
    const start = ordinal(fromDate);
    const end = ordinal(toDate);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;

    const days = new Set(workingDays);
    const excluded = new Set(holidays.map(ordinal).filter((day) => days.has(weekday(day))));

    let workingCount = 0;
    // Count days from start + 1 to end
    for (let day = start + 1; day <= end; day++) {
        if (days.has(weekday(day)) && !excluded.has(day)) {
            workingCount++;
        }
    }
    return workingCount;
}

module.exports = { workingDate, addWorkingDays, countWorkingDays, countWorkingDaysInclusive };
