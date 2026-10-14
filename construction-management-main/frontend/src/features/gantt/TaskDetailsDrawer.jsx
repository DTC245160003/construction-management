import { Drawer } from "antd";
import ActualProgressForm from "./ActualProgressForm";
import { formatDate, formatPlanDay, STATUS_LABELS, viewStatus } from "./scheduleViewModel";

export default function TaskDetailsDrawer({ task, tasks, dependencies, dependenciesLoaded, calendarOrigin, today,
    editProgress, onEditProgress, onEditTask, onClose, onSaveProgress, saving, error, success }) {
    const relatedTasks = (incoming) => dependencies.filter((dependency) => String(incoming ? dependency.successor_task_id : dependency.predecessor_task_id) === String(task?.id))
        .map((dependency) => ({ dependency, task: tasks.find((entry) => String(entry.id) === String(incoming ? dependency.predecessor_task_id : dependency.successor_task_id)) }));
    const status = task ? viewStatus(task, today) : "todo";
    return <Drawer open={Boolean(task)} title="Chi tiết công việc" onClose={onClose} placement="right"
        rootClassName="schedule-drawer" size={440} mask={{ closable: !saving }} keyboard={!saving}
        closable={saving ? false : { placement: "end" }} destroyOnHidden>
        {task && <>
            <div className="schedule-drawer-title"><small>CÔNG VIỆC #{task.id}{task.isMilestone ? " · MỐC TIẾN ĐỘ" : ""}</small><h2>{task.name}</h2>
                <span className={`schedule-status-badge status-${status}`}><i className={`gantt-status-dot status-${status}`} />{STATUS_LABELS[status]}</span>
                {task.isCritical && <span className="schedule-critical-badge">Đường găng</span>}
                {task.newlyCritical && <span className="schedule-critical-badge schedule-newly-critical-badge">Mới thành đường găng</span>}
            </div>
            {success && <p className="schedule-save-success" role="status">Đã cập nhật tiến độ</p>}
            {editProgress ? <ActualProgressForm key={`${task.id}-${task.percentComplete}-${task.actualStart}-${task.actualEnd}`} task={task} onSubmit={onSaveProgress} onCancel={() => onEditProgress(false)} loading={saving} error={error} /> : <>
                <div className="schedule-drawer-progress"><div><strong>Tiến độ</strong><span>{task.percentComplete === null ? "Chưa cập nhật" : `${task.percentComplete}%`}</span></div><div className="schedule-progress-meter"><i style={{ width: `${task.percentComplete ?? 0}%` }} /></div></div>
                <dl className="schedule-task-facts">
                    <div><dt>Kế hoạch</dt><dd>{task.plannedStartDate ? formatDate(task.plannedStartDate) : formatPlanDay(task.es, calendarOrigin)} <span>→</span> {task.plannedFinishDate ? formatDate(task.plannedFinishDate) : formatPlanDay(task.ef, calendarOrigin)}</dd></div>
                    {task.baselineEs !== null && <div><dt>Kế hoạch gốc</dt><dd>ES {task.baselineEs} → EF {task.baselineEf}</dd></div>}
                    <div><dt>Thực tế</dt><dd>{formatDate(task.actualStart)} <span>→</span> {formatDate(task.actualEnd)}</dd></div>
                    <div><dt>Người phụ trách</dt><dd>{task.assignee || "Chưa có thông tin"}</dd></div>
                    <div><dt>Thời lượng</dt><dd>{task.duration === null ? "—" : `${task.duration} ngày`}</dd></div>
                    <div><dt>Độ trễ cho phép</dt><dd>{task.totalFloat === null ? "—" : `${task.totalFloat} ngày`}</dd></div>
                </dl>
                <div className="schedule-cpm-facts">{["es", "ef", "ls", "lf"].map((key) => <div key={key}><small>{key.toUpperCase()}</small><strong>{task[key] ?? "—"}</strong></div>)}</div>
                {!calendarOrigin && <p className="schedule-drawer-note">Kế hoạch tính theo ngày kể từ lúc khởi công (Ngày 0).</p>}
                {[true, false].map((incoming) => <section className="schedule-related" key={String(incoming)}><h3>{incoming ? "Phụ thuộc" : "Công việc tiếp theo"}</h3>
                    {!dependenciesLoaded ? <p>Chưa tải được quan hệ phụ thuộc.</p> : relatedTasks(incoming).length === 0 ? <p>Không có công việc {incoming ? "trước" : "tiếp theo"}.</p> : <ul>{relatedTasks(incoming).map(({ dependency, task: related }) => <li key={dependency.id}><span>{related?.name || `Công việc #${incoming ? dependency.predecessor_task_id : dependency.successor_task_id}`}</span><small>{dependency.dependency_type} · {dependency.lag_days ?? 0} ngày</small></li>)}</ul>}
                </section>)}
                <div className="schedule-drawer-actions"><button type="button" className="schedule-button" onClick={onEditTask}>Chỉnh sửa</button><button type="button" className="schedule-button primary" onClick={() => onEditProgress(true)}>Cập nhật tiến độ</button></div>
            </>}
        </>}
    </Drawer>;
}
