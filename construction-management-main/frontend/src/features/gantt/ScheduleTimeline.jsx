import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Gantt, toBarModel } from "./index";
import { ScheduleKpis, ScheduleLegend, ScheduleToolbar } from "./ScheduleControls";
import TaskDetailsDrawer from "./TaskDetailsDrawer";
import TaskForm from "../../components/TaskForm";
import { api } from "../../services/operationsApi";
import { listTasks, listDependencies, saveTask } from "../../services/taskApi";
import { listWorkItems } from "../../services/workItemApi";
import { listWorkItemMilestones } from "../../services/scheduleApi";
import { updateTaskProgress } from "../../services/progressApi";
import { calendarDate, dayForDate, filterTasks, formatDate, ganttRows, scheduleRange, todayDate } from "./scheduleViewModel";
import { projectTaskCalendar, workingDate } from "./projectCalendar";

const initialFilters = { search: "", status: "all", assignee: "all", criticalOnly: false };
export default function ScheduleTimeline({ projectId, schedule, onScheduleChanged, criticalOnly, onShowAll }) {
    const [support, setSupport] = useState({ tasks: [], items: [], dependencies: [], milestones: [], ready: false });
    const [revision, setRevision] = useState(0);
    const [unit, setUnit] = useState("day");
    const [filters, setFilters] = useState(initialFilters);
    const [collapsed, setCollapsed] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [editingProgress, setEditingProgress] = useState(false);
    const [progress, setProgress] = useState({ saving: false, error: "", success: false });
    const [taskEditor, setTaskEditor] = useState(null);
    const [navigation, setNavigation] = useState(null);
    const [today, setToday] = useState(todayDate);
    useEffect(() => { const timer = setInterval(() => setToday(todayDate()), 60000); return () => clearInterval(timer); }, []);
    useEffect(() => {
        let cancelled = false;
        Promise.allSettled([listTasks(projectId), listWorkItems(projectId), listDependencies(projectId),
            api(`/projects/${projectId}/overview`), api(`/projects/${projectId}/calendar`), listWorkItemMilestones(projectId)])
            .then(results => {
                if (cancelled) return;
                const value = index => results[index].status === "fulfilled" ? results[index].value : null;
                setSupport({ tasks: value(0) || [], items: value(1) || [], dependencies: value(2) || [],
                    project: value(3)?.project, calendar: value(4) ? { ...value(4).calendar, holidays: value(4).holidays } : null,
                    milestones: value(5) || [], dependenciesLoaded: results[2].status === "fulfilled", ready: true });
            });
        return () => { cancelled = true; };
    }, [projectId, revision]);
    const origin = calendarDate(support.project?.start_date);
    const calendar = origin ? support.calendar : null;
    const tasks = useMemo(() => {
        const details = new Map(support.tasks.map(task => [String(task.id), task]));
        return schedule.map(task => projectTaskCalendar(toBarModel({ ...details.get(String(task.id)), ...task }), origin, calendar));
    }, [schedule, support.tasks, origin, calendar]);
    const todayOffset = calendar ? dayForDate(today, origin) : null;
    const visible = useMemo(() => filterTasks(tasks, filters, todayOffset), [tasks, filters, todayOffset]);
    const milestones = useMemo(() => calendar ? support.milestones.map(milestone => ({ ...milestone, day: dayForDate(calendarDate(milestone.target_date), origin) })) : [], [calendar, support.milestones, origin]);
    const range = useMemo(() => {
        const bounds = scheduleRange(tasks);
        const dates = milestones.map(milestone => milestone.day).filter(Number.isFinite);
        return { start: Math.min(bounds.start, ...dates), end: Math.max(bounds.end, ...dates) };
    }, [tasks, milestones]);
    const selected = tasks.find(task => String(task.id) === String(selectedId)) || null;
    const groups = ganttRows(visible, support.items).filter(row => row.group).map(row => row.group.id);
    const assignees = [...new Set(tasks.map(task => task.assignee).filter(Boolean))];
    const select = task => { setSelectedId(task.id); setEditingProgress(false); setProgress({ saving: false, error: "", success: false }); };
    const refresh = async () => { await onScheduleChanged(); setRevision(value => value + 1); };
    const saveProgress = async values => {
        setProgress({ saving: true, error: "", success: false });
        try {
            await updateTaskProgress(projectId, selected.id, values);
            await refresh();
            setEditingProgress(false);
            setProgress({ saving: false, error: "", success: true });
        } catch (error) { setProgress({ saving: false, error: error.response?.data?.message || error.message || "Không thể lưu tiến độ", success: false }); }
    };
    const persistTask = async (taskId, values) => {
        const saved = await saveTask(projectId, taskId, values);
        setTaskEditor(saved);
        await refresh();
    };
    const summary = schedule.summary;
    const finishLabel = offset => calendar
        ? formatDate(workingDate(origin, Math.max(0, offset - 1), calendar.working_days, (calendar.holidays || []).map(day => day.day || day)))
        : `Ngày ${offset}`;
    return <>
        <ScheduleKpis tasks={tasks} today={todayOffset}/>
        {summary && <div className="schedule-forecast" aria-label="Dự báo hoàn thành CPM">
            <div><span>Kế hoạch hoàn thành</span><strong>{finishLabel(summary.plannedFinish)}</strong></div>
            <div><span>Dự kiến hiện tại</span><strong>{finishLabel(summary.currentFinish)}</strong></div>
            <div><span>Chênh lệch tiến độ</span><strong className={summary.delayDays > 0 ? "is-delayed" : "is-early"}>{summary.delayDays > 0 ? `Chậm ${summary.delayDays} ngày` : summary.delayDays < 0 ? `Sớm ${-summary.delayDays} ngày` : "Đúng kế hoạch"}</strong></div>
        </div>}
        <div className="schedule-integration-tools">
            <div className="schedule-time-unit" role="group" aria-label="Đơn vị trục thời gian">{[["day", "Ngày"], ["week", "Tuần"], ["month", "Tháng"]].map(([value, label]) => <button key={value} aria-pressed={unit === value} onClick={() => setUnit(value)}>{label}</button>)}</div>
            <button className="schedule-button" disabled={todayOffset === null} onClick={() => setNavigation({ kind: "today", token: Date.now() })}>Hôm nay</button>
            <button className="schedule-button" aria-label="Cuộn về trước" onClick={() => setNavigation({ kind: "step", direction: -1, token: Date.now() })}>←</button>
            <button className="schedule-button" aria-label="Cuộn về sau" onClick={() => setNavigation({ kind: "step", direction: 1, token: Date.now() })}>→</button>
            {support.items.length > 0 && <button className="schedule-button primary" onClick={() => setTaskEditor({ work_item_id: support.items.find(item => !support.items.some(child => child.parent_id === item.id))?.id })}><span aria-hidden="true">+</span> Công việc</button>}
            <Link to={`/calendar?projectId=${projectId}`}>Lịch làm việc dự án</Link>
        </div>
        <p className="schedule-calendar-note">{calendar ? `Theo lịch làm việc đã lưu · Khởi công ${formatDate(origin)} · ${calendar.working_days.length} ngày/tuần · ${(calendar.holidays || []).length} ngày lễ/nghỉ riêng` : "Chưa tải được lịch dự án. Trục đang dùng ngày làm việc tương đối; ES/EF giữ nguyên từ CPM."}</p>
        {support.ready && !support.dependenciesLoaded && <p className="schedule-support-note">Chưa tải được quan hệ phụ thuộc. Các kết quả CPM vẫn được giữ.</p>}
        <div className="schedule-board">
            <ScheduleToolbar filters={filters} showCritical={false} assignees={assignees} groupIds={groups} onChange={(key, value) => setFilters(current => ({ ...current, [key]: value }))} onCollapse={() => setCollapsed(groups)} onShowAll={() => { setCollapsed([]); setFilters(initialFilters); if (criticalOnly) onShowAll(); }}/>
            <Gantt tasks={visible} start={range.start} end={range.end} width={Math.max(1200, Math.min(48000, (range.end - range.start) * 56))} unit={unit}
                calendarOrigin={calendar ? origin : null} calendar={calendar} today={todayOffset} milestones={milestones}
                items={support.items} dependencies={support.dependencies} selectedId={selectedId} collapsedGroups={collapsed}
                navigation={navigation} onToggleGroup={id => setCollapsed(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])} onBarSelect={select}/>
            <ScheduleLegend tasks={tasks}/>
            <div className="schedule-legend"><span>Thanh xám: kế hoạch gốc</span><span>Thanh xanh lá: ngày thực tế</span><span>Vùng nền: ngày nghỉ theo lịch dự án</span></div>
        </div>
        {support.milestones.length > 0 && <div className="schedule-milestones" aria-label="Mốc bàn giao">{support.milestones.map(milestone => <div className="schedule-milestone-chip" key={milestone.id}>◆ {milestone.name} · {formatDate(calendarDate(milestone.target_date))}</div>)}</div>}
        <TaskDetailsDrawer task={selected} tasks={tasks} dependencies={support.dependencies} dependenciesLoaded={support.dependenciesLoaded} calendarOrigin={calendar ? origin : null} today={todayOffset}
            editProgress={editingProgress} onEditProgress={setEditingProgress} onEditTask={() => { setTaskEditor(support.tasks.find(task => String(task.id) === String(selectedId)) || schedule.find(task => String(task.id) === String(selectedId))); setSelectedId(null); }}
            onClose={() => { if (!progress.saving) setSelectedId(null); }} onSaveProgress={saveProgress} {...progress}/>
        {taskEditor && <TaskForm key={`${projectId}-${taskEditor.id || "new"}`} projectId={projectId} task={taskEditor} items={support.items} tasks={support.tasks} dependencies={support.dependencies}
            onSave={persistTask} onClose={() => setTaskEditor(null)} onDependencyAdded={refresh} onDependencyRemoved={refresh}/>}
    </>;
}
