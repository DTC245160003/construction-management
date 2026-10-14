const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export const TIME_UNITS = Object.freeze({ DAY: "day", WEEK: "week", MONTH: "month" });

function validDateParts(year, month, day) {
    if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return null;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return day <= lastDay ? { year, month, day } : null;
}

function dateOnlyParts(value) {
    if (typeof value === "string") {
        const match = DATE_ONLY.exec(value);
        if (!match) return null;
        return validDateParts(Number(match[1]), Number(match[2]), Number(match[3]));
    }
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return validDateParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
    }
    return null;
}

function dateValue(value) {
    if (typeof value === "string") {
        if (DATE_ONLY.test(value)) {
            const parts = dateOnlyParts(value);
            return parts ? Date.UTC(parts.year, parts.month - 1, parts.day) : null;
        }
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    if (value instanceof Date) {
        const parts = dateOnlyParts(value);
        if (parts) return Date.UTC(parts.year, parts.month - 1, parts.day);
        const parsed = value.getTime();
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function isDateLike(value) {
    return dateValue(value) !== null;
}

function dayDifference(value, originValue) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const current = dateValue(value);
    if (current === null || !Number.isFinite(originValue)) return null;
    return (current - originValue) / DAY_MS;
}

function assertRange(start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        throw new RangeError("Time scale requires a finite end after its start");
    }
}

function formatDateLabel(originValue, value) {
    const date = new Date(originValue + value * DAY_MS);
    return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function labelFor(value, unit, originValue, hasDateOrigin) {
    if (unit === TIME_UNITS.MONTH) {
        if (!hasDateOrigin) return `Tháng ${Math.floor(value / 30) + 1}`;
        const date = new Date(originValue + value * DAY_MS);
        return `Tháng ${date.getUTCMonth() + 1}/${date.getUTCFullYear()}`;
    }
    if (hasDateOrigin) {
        return unit === TIME_UNITS.WEEK
            ? `Tuần ${Math.floor(value / 7) + 1}`
            : formatDateLabel(originValue, value);
    }
    return unit === TIME_UNITS.WEEK ? `Tuần ${Math.floor(value / 7) + 1}` : `Ngày ${value}`;
}

export function createTimeScale({
    start = 0,
    end = 1,
    startDate = start,
    endDate = end,
    originDate,
    width = 1000,
    unit = TIME_UNITS.DAY
} = {}) {
    if (!Object.values(TIME_UNITS).includes(unit)) {
        throw new RangeError(`Unsupported time unit: ${unit}`);
    }
    if (!Number.isFinite(width) || width <= 0) throw new RangeError("Time scale width must be positive");

    const startIsDate = isDateLike(startDate);
    const endIsDate = isDateLike(endDate);
    const startIsDateInput = typeof startDate === "string" || startDate instanceof Date;
    const endIsDateInput = typeof endDate === "string" || endDate instanceof Date;
    if ((startIsDateInput && !startIsDate) || (endIsDateInput && !endIsDate) || (endIsDate && !startIsDate)) {
        throw new RangeError("Date inputs must be valid and a date end requires a valid start date");
    }
    if (originDate !== undefined && !isDateLike(originDate)) throw new RangeError("Calendar origin must be a valid date");
    const hasDateOrigin = startIsDate || originDate !== undefined;
    const originValue = startIsDate ? dateValue(startDate) : originDate !== undefined ? dateValue(originDate) : null;
    const startDay = startIsDate ? 0 : Number(start);
    const endDay = startIsDate
        ? (endIsDate ? (dateValue(endDate) - originValue) / DAY_MS : Number(end))
        : Number(end);
    assertRange(startDay, endDay);
    const duration = endDay - startDay;
    const xFor = (value) => {
        const day = hasDateOrigin ? dayDifference(value, originValue) : Number(value);
        if (!Number.isFinite(day)) return null;
        return ((day - startDay) / duration) * width;
    };
    const widthFor = (days) => {
        const value = Number(days);
        return Number.isFinite(value) ? (value / duration) * width : 0;
    };
    const tickStep = unit === TIME_UNITS.MONTH ? 30 : unit === TIME_UNITS.WEEK ? 7 : 1;
    const ticks = [];
    const values = [];
    if (unit === TIME_UNITS.MONTH && hasDateOrigin) {
        values.push(startDay);
        const date = new Date(originValue + startDay * DAY_MS);
        date.setUTCDate(1);
        date.setUTCMonth(date.getUTCMonth() + 1);
        while ((date.getTime() - originValue) / DAY_MS <= endDay) {
            values.push((date.getTime() - originValue) / DAY_MS);
            date.setUTCMonth(date.getUTCMonth() + 1);
        }
    } else {
        for (let value = Math.ceil(startDay / tickStep) * tickStep; value <= endDay; value += tickStep) values.push(value);
    }
    for (const value of values) {
        const date = hasDateOrigin ? new Date(originValue + value * DAY_MS) : null;
        ticks.push(Object.freeze({
            value,
            x: ((value - startDay) / duration) * width,
            label: labelFor(value, unit, originValue, hasDateOrigin),
            weekday: date ? ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][date.getUTCDay()] : null
        }));
    }

    return Object.freeze({
        start: startDay,
        end: endDay,
        duration,
        width,
        unit,
        origin: originValue,
        ticks: Object.freeze(ticks),
        timeToX: xFor,
        position: xFor,
        durationToWidth: widthFor,
        widthFor
    });
}

export function timeToX(value, scale) {
    if (!scale || typeof scale.timeToX !== "function") throw new TypeError("A time scale is required");
    return scale.timeToX(value);
}

export function durationToWidth(duration, scale) {
    if (!scale || typeof scale.durationToWidth !== "function") throw new TypeError("A time scale is required");
    return scale.durationToWidth(duration);
}
