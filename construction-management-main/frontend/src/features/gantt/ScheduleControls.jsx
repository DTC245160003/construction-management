import { calendarValue, scheduleKpis, STATUS_LABELS } from "./scheduleViewModel";

export function ScheduleIcon({ name, size = 18 }) {
    const paths = {
        search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
        calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4m8-4v4" /></>,
        plus: <path d="M12 5v14M5 12h14" />,
        chevron: <path d="m14 6-6 6 6 6" />,
        refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 7a7 7 0 0 1 12-2L20 8M4 16l2.5 3a7 7 0 0 0 12-2" /></>,
        layers: <><path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5" /></>,
        check: <path d="m5 12 4 4L19 6" />,
        alert: <><path d="m12 3 10 18H2zM12 9v5m0 3v.1" /></>,
        critical: <><path d="M4 7h5v10h6V7h5" /><circle cx="3" cy="7" r="1" /><circle cx="21" cy="7" r="1" /></>
    };
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.calendar}</svg>;
}

export function ScheduleKpis({ tasks, today }) {
    const values = scheduleKpis(tasks, today);
    const cards = [
        { label: "Tiến độ", value: values.progress === null ? "—" : `${values.progress}%`, note: values.progress === null ? "Chưa có dữ liệu tiến độ" : "Theo thời lượng công việc", icon: "layers", tone: "blue" },
        { label: "Hoàn thành", value: `${values.completed ?? "—"}/${values.total}`, note: "Công việc đạt 100%", icon: "check", tone: "green" },
        { label: "Có nguy cơ trễ", value: values.risk ?? "—", note: values.risk === null ? "Cần ngày khởi công để đánh giá" : "Chậm tiến độ hoặc quá hạn", icon: "alert", tone: "orange" },
        { label: "Công việc găng", value: values.critical, note: "Theo kết quả đường găng", icon: "critical", tone: "navy" }
    ];
    return <div className="schedule-kpis">{cards.map((card) => <article className={`schedule-kpi tone-${card.tone}`} key={card.label}>
        <div className="schedule-kpi-top"><span>{card.label}</span><i><ScheduleIcon name={card.icon} /></i></div>
        <strong>{card.value}</strong><small>{card.note}</small>
        {card.label === "Tiến độ" && <div className="schedule-kpi-meter"><i style={{ width: `${values.progress ?? 0}%` }} /></div>}
    </article>)}</div>;
}

export function ScheduleToolbar({ filters, onChange, assignees, groupIds, onCollapse, onShowAll, showCritical = true }) {
    return <div className="schedule-toolbar">
        <label className="schedule-search"><ScheduleIcon name="search" /><input type="search" placeholder="Tìm công việc..." aria-label="Tìm công việc" value={filters.search} onChange={(event) => onChange("search", event.target.value)} /></label>
        <select aria-label="Lọc trạng thái" value={filters.status} onChange={(event) => onChange("status", event.target.value)}>
            <option value="all">Tất cả trạng thái</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {assignees.length > 0 && <select aria-label="Lọc người phụ trách" value={filters.assignee} onChange={(event) => onChange("assignee", event.target.value)}>
            <option value="all">Tất cả người phụ trách</option>{assignees.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>}
        {showCritical && <label className="schedule-critical-filter"><input type="checkbox" checked={filters.criticalOnly} onChange={(event) => onChange("criticalOnly", event.target.checked)} />Chỉ hiện công việc găng</label>}
        <div className="schedule-toolbar-end"><button className="schedule-text-button" type="button" disabled={!groupIds.length} onClick={onCollapse}>Thu gọn tất cả</button><button className="schedule-text-button" type="button" onClick={onShowAll}>Hiện tất cả</button></div>
    </div>;
}

export function ScheduleLegend({ tasks = [] }) {
    return <div className="schedule-legend gantt-legend" aria-label="Chú giải trạng thái">
        {["complete", "active", "risk", "late"].map((status) => <span key={status}><i className={`gantt-status-dot status-${status}`} />{STATUS_LABELS[status]}</span>)}
        <span><i className="legend-milestone">◆</i>Milestone</span><span><i className="legend-critical" />Đường găng</span>
        {tasks.some((task) => task.newlyCritical) && <span><i className="legend-newly-critical" />Mới thành găng</span>}
    </div>;
}

export function ScheduleSkeleton() {
    return <div className="schedule-loading" role="status" aria-label="Đang tải tiến độ…" aria-live="polite"><span className="schedule-sr-only">Đang tải tiến độ…</span>
        <div className="schedule-kpis">{[0, 1, 2, 3].map((key) => <div key={key} className="schedule-kpi schedule-skeleton"><i /><i /></div>)}</div>
        <div className="schedule-skeleton-grid">{[0, 1, 2, 3, 4, 5].map((key) => <div key={key}><i /><i style={{ marginLeft: `${key * 5}%` }} /></div>)}</div>
    </div>;
}

export function CalendarSettings({ value, onChange }) {
    return <details className="schedule-calendar-settings"><summary><ScheduleIcon name="calendar" />{value ? "Ngày khởi công" : "Gắn lịch dự án"}</summary>
        <div className="schedule-calendar-popover"><label>Ngày khởi công (Ngày 0)<input type="date" aria-label="Ngày khởi công cho chế độ xem" value={value} onChange={(event) => {
            if (!event.target.value || calendarValue(event.target.value) !== null) onChange(event.target.value);
        }} /></label><p>Áp dụng cho chế độ xem trên máy này. Lịch ngày, cuối tuần và Hôm nay được tính từ mốc này.</p>
        {value && <button type="button" className="schedule-text-button" onClick={() => onChange("")}>Dùng ngày tương đối</button>}</div>
    </details>;
}
