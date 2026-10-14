import { useEffect, useId, useMemo, useState } from "react";
import { adaptScheduleToBars } from "./barModel";
import { createTimeScale } from "./timeScale";
import { calendarValue, ganttRows, scheduleRange, STATUS_LABELS, viewStatus } from "./scheduleViewModel";
import GanttTooltip from "./GanttTooltip";
import { barGeometry } from "./barGeometry.js";
import useGanttViewport from "./useGanttViewport";
import { nonWorkingDays } from "./projectCalendar";
import "./gantt.css";

const DAY_MS = 86400000;
const HEADER_HEIGHT = 60;

function restSpans(scale, width, calendar, origin) {
    if (scale.origin === null || scale.end - scale.start > 36600) return [];
    const days = calendar ? nonWorkingDays(origin, scale.start, scale.end, calendar)
        : Array.from({ length: Math.ceil(scale.end) - Math.floor(scale.start) }, (_, index) => index + Math.floor(scale.start))
            .filter(day => [0, 6].includes(new Date(scale.origin + day * DAY_MS).getUTCDay()));
    return days.map(day => ({ day, left: Math.max(0, scale.timeToX(day)),
        width: Math.min(width, scale.timeToX(day + 1)) - Math.max(0, scale.timeToX(day)) }));
}

function tooltipPosition(event, container) {
    const rect = container.getBoundingClientRect();
    const target = event.currentTarget.getBoundingClientRect();
    const x = Number.isFinite(event.clientX) && event.clientX !== 0 ? event.clientX : target.left + target.width / 2;
    const y = Number.isFinite(event.clientY) && event.clientY !== 0 ? event.clientY : target.bottom;
    const tooltipWidth = Math.min(270, rect.width - 16);
    return {
        left: container.scrollLeft + Math.max(8, Math.min(x - rect.left + 12, rect.width - tooltipWidth - 8)),
        top: container.scrollTop + Math.max(8, Math.min(y - rect.top + 12, rect.height - 174)),
        width: tooltipWidth
    };
}

function dependencyPath(source, target, type, rowHeight) {
    const startAtEnd = type[0] === "F";
    const finishAtEnd = type[1] === "F";
    const sx = startAtEnd ? source.right : source.left;
    const tx = finishAtEnd ? target.right : target.left;
    const exit = sx + (startAtEnd ? 12 : -12);
    const entry = tx + (finishAtEnd ? 12 : -12);
    const gutter = source.y + rowHeight / 2;
    return `M ${sx} ${source.y} H ${exit} V ${gutter} H ${entry} V ${target.y} H ${tx}`;
}

export default function Gantt({
    tasks = [], start, end, startDate, endDate, calendarOrigin,
    unit = "day", width = 1200, rowHeight = 44,
    items = [], dependencies = [], collapsedGroups = [], onToggleGroup, calendar = null, milestones = [],
    selectedId, today = null, navigation, onBarHover, onBarSelect, cycleMessage = ""
}) {
    const markerId = `gantt-arrow-${useId().replaceAll(":", "")}`;
    const [localSelected, setLocalSelected] = useState(null);
    const [tooltip, setTooltip] = useState(null);
    const [hoveredId, setHoveredId] = useState(null);
    const bars = useMemo(() => adaptScheduleToBars(tasks), [tasks]);
    const rows = useMemo(() => ganttRows(bars, items, collapsedGroups), [bars, items, collapsedGroups]);
    const { containerRef, first, end: windowEnd, windowed } = useGanttViewport(rows.length, rowHeight, HEADER_HEIGHT);
    const range = useMemo(() => {
        const automatic = scheduleRange(bars);
        return { start: start ?? automatic.start, end: end ?? automatic.end };
    }, [bars, start, end]);
    const scale = useMemo(() => createTimeScale({
        ...range, startDate: startDate ?? range.start, endDate: endDate ?? range.end,
        originDate: calendarOrigin || undefined, width, unit
    }), [range, startDate, endDate, calendarOrigin, width, unit]);
    const activeId = selectedId === undefined ? localSelected : selectedId;
    const labelTicks = useMemo(() => {
        const minimumSpacing = scale.ticks.slice(1).reduce((minimum, tick, index) =>
            Math.min(minimum, tick.x - scale.ticks[index].x), Infinity);
        const widestLabel = scale.ticks.reduce((widest, tick) => Math.max(widest, tick.label.length * 7 + 16), 0);
        const labelStride = Math.max(1, Math.ceil((widestLabel + 8) / minimumSpacing));
        return scale.ticks.filter((_, index) => index % labelStride === 0);
    }, [scale.ticks]);
    const geometry = useMemo(() => {
        const positions = new Map();
        rows.forEach((row, index) => {
            if (!row.bar) return;
            const position = barGeometry(row.bar, scale);
            if (position) positions.set(String(row.bar.id), { ...position, y: index * rowHeight + rowHeight / 2 });
        });
        return positions;
    }, [rows, scale, rowHeight]);
    const weekends = useMemo(() => restSpans(scale, width, calendar, calendarOrigin), [scale, width, calendar, calendarOrigin]);
    const todayX = today === null ? null : scale.timeToX(today);
    const gridlineNodes = useMemo(() => scale.ticks.map((tick) => <i key={tick.value} className="gantt-gridline" style={{ left: tick.x }} aria-hidden="true" />), [scale.ticks]);
    const weekendNodes = useMemo(() => weekends.map((span) => <i key={`weekend-${span.day}`} className="gantt-weekend" style={{ left: span.left, width: span.width }} />), [weekends]);
    const header = useMemo(() => <div className="gantt-header">
        <div className="gantt-name-header"><strong>CÔNG VIỆC</strong><small>{bars.length} công việc</small></div>
        <div className="gantt-axis" style={{ width }}>{weekendNodes}{gridlineNodes}
            {labelTicks.map((tick) => <div key={tick.value} className={`gantt-tick${tick.x === 0 ? " gantt-tick-first" : ""}`} style={{ left: tick.x }}>
                <small>{unit === "day" ? tick.weekday || "TIẾN ĐỘ" : calendarValue(calendarOrigin) !== null ? "LỊCH DỰ ÁN" : "NGÀY TƯƠNG ĐỐI"}</small>
                <span className="gantt-tick-label">{tick.label}</span>
            </div>)}
        </div>
    </div>, [bars.length, width, weekendNodes, gridlineNodes, labelTicks, unit, calendarOrigin]);

    useEffect(() => {
        if (!tooltip) return undefined;
        const closeEscape = (event) => { if (event.key === "Escape") setTooltip(null); };
        const closeOutside = (event) => { if (!containerRef.current?.contains(event.target)) setTooltip(null); };
        document.addEventListener("keydown", closeEscape);
        document.addEventListener("pointerdown", closeOutside);
        return () => {
            document.removeEventListener("keydown", closeEscape);
            document.removeEventListener("pointerdown", closeOutside);
        };
    }, [tooltip, containerRef]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container || !navigation) return;
        if (navigation.kind === "today" && todayX !== null) {
            container.scrollTo({ left: Math.max(0, todayX - container.clientWidth / 3), behavior: "smooth" });
        } else if (navigation.kind === "step") {
            container.scrollBy({ left: navigation.direction * Math.max(160, container.clientWidth * 0.65), behavior: "smooth" });
        }
    }, [navigation, todayX, containerRef]);

    const selectBar = (bar) => {
        setLocalSelected(bar.id);
        setTooltip(null);
        onBarSelect?.(bar);
    };
    const showTooltip = (bar, event) => {
        setHoveredId(bar.id);
        setTooltip({ bar, style: tooltipPosition(event, containerRef.current) });
        onBarHover?.(bar);
    };
    const scrollTooltip = () => {
        const container = containerRef.current;
        const focused = container?.querySelector(".gantt-bar:focus");
        if (!focused) setTooltip(null);
        else setTooltip((current) => current ? { ...current, style: tooltipPosition({ currentTarget: focused }, container) } : current);
    };

    if (cycleMessage) return <div className="gantt-cycle-alert" role="alert">{cycleMessage}</div>;
    if (!bars.length) return <div className="gantt-empty" role="status">Không có công việc phù hợp.</div>;
    return <section className="gantt" aria-label="Biểu đồ Gantt" style={{ "--gantt-timeline-width": `${width}px`, "--gantt-row-height": `${rowHeight}px` }}>
        <div className="gantt-scroll" ref={containerRef} tabIndex={0} aria-label="Vùng cuộn tiến độ"
            onScroll={scrollTooltip} onClick={(event) => { if (!event.target.closest(".gantt-bar")) setTooltip(null); }}>
            <div className="gantt-grid" data-row-count={rows.length} data-task-count={bars.length} data-windowed={windowed}>
                {header}
                <div className="gantt-body-gridlines" style={{ top: HEADER_HEIGHT + first * rowHeight, width, height: (windowEnd - first) * rowHeight }} aria-hidden="true">
                    {weekendNodes}{gridlineNodes}
                </div>
                {todayX !== null && todayX >= 0 && todayX <= width && <div className="gantt-today-layer" style={{ top: 0, height: HEADER_HEIGHT + rows.length * rowHeight }} aria-label="Hôm nay">
                    <div className="gantt-today" style={{ left: todayX }}><span>Hôm nay</span></div>
                </div>}
                {dependencies.length > 0 && <svg className="gantt-dependencies" style={{ top: HEADER_HEIGHT + first * rowHeight }} width={width} height={(windowEnd - first) * rowHeight}
                    viewBox={`0 ${first * rowHeight} ${width} ${(windowEnd - first) * rowHeight}`} aria-label="Quan hệ phụ thuộc">
                    <defs><marker id={markerId} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto-start-reverse"><path d="M 0 0 L 6 3 L 0 6 z" fill="context-stroke" /></marker></defs>
                    {dependencies.map((dependency) => {
                        const source = geometry.get(String(dependency.predecessor_task_id));
                        const target = geometry.get(String(dependency.successor_task_id));
                        if (!source || !target) return null;
                        if (Math.max(source.y, target.y) + rowHeight < first * rowHeight || Math.min(source.y, target.y) > windowEnd * rowHeight) return null;
                        const type = ["FS", "SS", "FF", "SF"].includes(dependency.dependency_type) ? dependency.dependency_type : "FS";
                        const related = [dependency.predecessor_task_id, dependency.successor_task_id].some((id) => String(id) === String(hoveredId) || String(id) === String(activeId));
                        return <path key={dependency.id ?? `${dependency.predecessor_task_id}-${dependency.successor_task_id}`} className={`gantt-dependency${related ? " is-highlighted" : ""}`}
                            data-type={type} d={dependencyPath(source, target, type, rowHeight)} markerEnd={`url(#${markerId})`}><title>{type} · Độ trễ {dependency.lag_days ?? 0} ngày</title></path>;
                    })}
                </svg>}
                {first > 0 && <div className="gantt-row-spacer" style={{ height: first * rowHeight }} aria-hidden="true" />}
                {rows.slice(first, windowEnd).map((row, offset) => {
                    if (row.group) return <div className="gantt-group-row" key={`group-${row.group.id}`} data-row-index={first + offset}>
                        <button className="gantt-name gantt-group-name" type="button" aria-expanded={!collapsedGroups.includes(row.group.id)} onClick={() => onToggleGroup?.(row.group.id)}>
                            <span className="gantt-group-chevron" aria-hidden="true">{collapsedGroups.includes(row.group.id) ? "›" : "⌄"}</span><strong title={row.group.name}>{row.group.name}</strong><small>{row.group.count}</small>
                        </button><div className="gantt-group-track" />
                    </div>;
                    const bar = row.bar;
                    const position = geometry.get(String(bar.id));
                    const barWidth = position ? position.right - position.left : 0;
                    const status = viewStatus(bar, today);
                    const selected = String(activeId) === String(bar.id);
                    const baseline = barGeometry({ es: bar.baselineDisplayEs ?? bar.baselineEs, ef: bar.baselineDisplayEf ?? bar.baselineEf }, scale);
                    const actual = barGeometry({ es: bar.actualDisplayEs, ef: bar.actualDisplayEf }, scale);
                    return <div key={String(bar.id)} className={`gantt-row${bar.isCritical ? " is-critical" : ""}${selected ? " gantt-row-selected" : ""}${bar.newlyCritical ? " gantt-row-newly-critical is-newly-critical" : ""}`} style={{ height: rowHeight }} data-task-id={bar.id} data-row-index={first + offset}>
                        <button className="gantt-name gantt-task-name" type="button" onClick={() => selectBar(bar)} aria-label={`Chi tiết ${bar.name}`}>
                            <i className={`gantt-status-dot status-${status}`} aria-hidden="true" /><span className="gantt-task-copy"><strong title={bar.name}>{bar.name || `#${bar.id}`}</strong><small>{STATUS_LABELS[status]}{bar.duration !== null ? ` · ${bar.duration} ngày` : ""}</small></span>
                            {bar.newlyCritical && <span className="gantt-name-newly-critical" title="Mới thành găng">Mới găng</span>}
                            {bar.isCritical && <span className="gantt-name-critical" title="Đường găng" aria-label="Đường găng">Găng</span>}
                        </button>
                        <div className="gantt-track" style={{ width }}>
                            {baseline && <span className="gantt-baseline-bar" style={{ left: baseline.left, width: baseline.right - baseline.left }} title={`Kế hoạch gốc: ES ${bar.baselineEs} → EF ${bar.baselineEf}`}/>}
                            {actual && <span className="gantt-actual-bar" style={{ left: actual.left, width: actual.right - actual.left }} title={`Thực tế: ${bar.actualStart} → ${bar.actualEnd}`}/>}
                            {position ? <button type="button" className={`gantt-bar status-${status}${bar.isCritical ? " gantt-bar-critical" : ""}${bar.newlyCritical ? " gantt-bar-newly-critical" : ""}${selected ? " gantt-bar-selected" : ""}${bar.isMilestone ? " gantt-milestone" : ""}`}
                                style={{ left: position.left, width: bar.isMilestone ? 16 : barWidth, top: (rowHeight - (bar.isMilestone ? 16 : 26)) / 2 }}
                                aria-label={`${bar.name || "Công việc"}${bar.isMilestone ? " — mốc tiến độ" : ""}${bar.isCritical ? " — đường găng" : ""}`}
                                aria-pressed={selected}
                                title={`${bar.name}: ES ${bar.es}, EF ${bar.ef}, LS ${bar.ls}, LF ${bar.lf}, dự trữ ${bar.totalFloat} ngày`}
                                onMouseEnter={(event) => showTooltip(bar, event)} onFocus={(event) => showTooltip(bar, event)}
                                onMouseLeave={() => { setHoveredId(null); setTooltip(null); }} onBlur={() => setTooltip(null)}
                                onClick={() => selectBar(bar)}>
                                {bar.isCritical && <span className="gantt-critical-marker" aria-hidden="true">{bar.isMilestone ? "!" : "◆"}</span>}
                                {bar.isMilestone ? <span className="gantt-milestone-symbol" aria-hidden="true">◆</span> : <>
                                    {bar.percentComplete !== null && <span className="gantt-progress" style={{ width: `${Math.max(0, Math.min(100, bar.percentComplete))}%` }} />}
                                    {barWidth > 42 && <span className="gantt-bar-label">{bar.percentComplete === null ? "" : `${bar.percentComplete}%`}</span>}
                                </>}
                            </button> : !Number.isFinite(bar.es) || !Number.isFinite(bar.ef) || bar.ef < bar.es ? <span className="gantt-missing-range">Chưa có mốc tiến độ hợp lệ</span> : null}
                        </div>
                    </div>;
                })}
                {windowEnd < rows.length && <div className="gantt-row-spacer" style={{ height: (rows.length - windowEnd) * rowHeight }} aria-hidden="true" />}
                {milestones.filter(milestone => Number.isFinite(milestone.day)).map(milestone => <div key={milestone.id} className="gantt-milestone-line" style={{ left: `calc(var(--gantt-name-width) + ${scale.timeToX(milestone.day)}px)`, top: HEADER_HEIGHT, height: rows.length * rowHeight }} title={`${milestone.name}: ${milestone.target_date}`}><span>◆ {milestone.name}</span></div>)}
            </div>
            {tooltip && <GanttTooltip bar={tooltip.bar} style={tooltip.style} calendarOrigin={calendarOrigin} today={today} onClose={() => setTooltip(null)} />}
        </div>
    </section>;
}
