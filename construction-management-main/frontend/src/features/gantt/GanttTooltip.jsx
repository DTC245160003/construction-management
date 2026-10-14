import { formatPlanDay, STATUS_LABELS, viewStatus } from "./scheduleViewModel";

function display(value) {
    return value === null || value === undefined || value === "" ? "—" : value;
}

export default function GanttTooltip({ bar, style, onClose, calendarOrigin, today }) {
    if (!bar) return null;
    return <aside className="gantt-tooltip" style={style} role="tooltip" aria-label={`Chi tiết ${bar.name}`}>
        <div className="gantt-tooltip-heading">
            <strong>{bar.name || "Công việc"}</strong>
            <button type="button" onClick={onClose} aria-label="Đóng chú giải">×</button>
        </div>
        <p className="gantt-tooltip-summary">{STATUS_LABELS[viewStatus(bar, today)]}{bar.percentComplete !== null ? ` · ${bar.percentComplete}%` : ""}</p>
        {bar.isMilestone && <p className="gantt-tooltip-date">Mốc tiến độ · {formatPlanDay(bar.es, calendarOrigin)}</p>}
        <dl>
            <div><dt>ES</dt><dd>{display(bar.es)}</dd></div>
            <div><dt>EF</dt><dd>{display(bar.ef)}</dd></div>
            <div><dt>LS</dt><dd>{display(bar.ls)}</dd></div>
            <div><dt>LF</dt><dd>{display(bar.lf)}</dd></div>
            <div><dt>Total Float</dt><dd>{display(bar.totalFloat)}</dd></div>
        </dl>
    </aside>;
}
