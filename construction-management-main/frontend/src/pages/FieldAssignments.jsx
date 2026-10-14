import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import { AssignmentOverview } from "../components/ModuleInsights";
import Icon from "../components/OperationsIcon";
import { Empty, Field, FormActions, Modal, NoProject, Notice, RemoteState } from "../components/OperationsUI";
import useRemote from "../hooks/useRemote";
import AttachmentPicker from "../components/AttachmentPicker";
import ScheduleTaskEditor from "../components/TaskForm";
import { saveTask } from "../services/taskApi";
import { photoUrl } from "../services/siteApi";
import "../styles/SiteModules.css";
import { api, dateLabel, numberLabel, projectPath, roleLabels, today } from "../services/operationsApi";
import { scopedLink, validProjectId } from "../services/navigation";
import "../styles/FieldAssignments.css";

const statuses = { planned: "Chưa thực hiện", active: "Đang thực hiện", completed: "Hoàn thành" };
const tones = { planned: "gray", active: "", completed: "green" };
function TeamForm({ projectId, onClose, onSaved }) {
  const people = useRemote(projectPath(projectId, "/participants"));
  const [name, setName] = useState("");
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api(projectPath(projectId, "/teams"), { method: "POST", body: { name, member_ids: selected } }); onSaved("Đã tạo đội thi công."); }
    catch (failure) { setError(failure.message); setBusy(false); }
  }
  return <Modal title="Tạo đội thi công" onClose={onClose} busy={busy}><Notice tone="error">{error}</Notice><form onSubmit={submit}>
    <Field label="Tên đội"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} required maxLength={255} placeholder="Ví dụ: Đội thi công móng" /></Field>
    <p className="ops-muted">Chọn thành viên đã tham gia dự án. Người có vai trò Đội trưởng sẽ được báo khối lượng cho đội.</p>
    <RemoteState state={people}><div className="ops-team-people">{people.data?.participants.map((person) => <label className="ops-checkbox" key={person.id}><input type="checkbox" checked={selected.includes(person.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, person.id] : selected.filter((id) => id !== person.id))} /><span>{person.fullname}<small>{roleLabels[person.role] || person.role}</small></span></label>)}</div></RemoteState>
    <FormActions busy={busy || !selected.length} onClose={onClose} label="Tạo đội" />
  </form></Modal>;
}
function TaskForm({ kind, task, teams, projectId, onClose, onSaved }) {
  const [values, setValues] = useState({ team_id: task.team_id || "", planned_quantity: task.planned_quantity || "", unit: task.unit || "", quantity: "", day: today(), notes: "", description: "", resolution: "", client_uuid: crypto.randomUUID(), photo_ids: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = (event) => setValues({ ...values, [event.target.name]: event.target.value });
  const titles = { assign: "Phân công đội thi công", quantity: "Khối lượng kế hoạch", progress: "Báo khối lượng hoàn thành", issue: "Báo vướng mắc", resolve: "Xử lý vướng mắc" };
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    const actions = {
      assign: ["PUT", `/assignments/${task.id}`, { team_id: Number(values.team_id) }],
      quantity: ["PUT", `/assignments/${task.id}/quantity`, { planned_quantity: Number(values.planned_quantity), unit: values.unit }],
      progress: ["POST", `/assignments/${task.id}/progress`, { day: values.day, quantity: Number(values.quantity), notes: values.notes, client_uuid: values.client_uuid }],
      issue: ["POST", `/assignments/${task.id}/issues`, { description: values.description,photo_ids:values.photo_ids }],
      resolve: ["PATCH", `/issues/${task.id}/close`, { resolution: values.resolution }],
    };
    const [method, suffix, body] = actions[kind];
    try { const result = await api(projectPath(projectId, suffix), { method, body }); onSaved(result.warning || "Đã lưu thành công.", Boolean(result.warning)); }
    catch (failure) { setError(failure.message); setBusy(false); }
  }
  return <Modal title={titles[kind]} onClose={onClose} busy={busy}><p className="ops-task-form-name">{task.name || task.description}</p><Notice tone="error">{error}</Notice><form onSubmit={submit}>
    {kind === "assign" && <><Field label="Đội phụ trách"><select name="team_id" value={values.team_id} onChange={change} required><option value="">Chọn đội thi công</option>{teams.map((team) => <option value={team.id} key={team.id}>{team.name} ({team.members.length} thành viên)</option>)}</select></Field>{!teams.length && <Notice>Tạo đội thi công trước khi phân công công việc.</Notice>}</>}
    {kind === "quantity" && <div className="ops-grid-two"><Field label="Khối lượng kế hoạch"><input type="number" name="planned_quantity" value={values.planned_quantity} onChange={change} min="0.0001" step="0.0001" required /></Field><Field label="Đơn vị"><input name="unit" value={values.unit} onChange={change} required maxLength={30} placeholder="m³, m², tấn…" /></Field></div>}
    {kind === "progress" && <><Notice>Kế hoạch: {numberLabel(task.planned_quantity)} {task.unit}. Khối lượng báo cáo là phần thực hiện thêm trong ngày.</Notice><div className="ops-grid-two"><Field label="Ngày thực hiện"><input name="day" type="date" value={values.day} onChange={change} min="1900-01-01" max="9999-12-31" required /></Field><Field label={`Khối lượng (${task.unit || "chưa có đơn vị"})`}><input name="quantity" type="number" value={values.quantity} onChange={change} min="0.0001" step="0.0001" required /></Field></div><Field label="Ghi chú"><textarea name="notes" value={values.notes} onChange={change} maxLength={2000} /></Field></>}
    {kind === "issue" && <Field label="Mô tả vướng mắc"><textarea autoFocus name="description" value={values.description} onChange={change} maxLength={5000} required placeholder="Mô tả tình trạng và hỗ trợ cần thiết…" /></Field>}
    {kind === "issue" && <AttachmentPicker projectId={projectId} itemId={task.work_item_id} selected={values.photo_ids} onChange={(ids) => setValues({ ...values,photo_ids:ids })} />}
    {kind === "resolve" && <Field label="Ghi chú xử lý"><textarea autoFocus name="resolution" value={values.resolution} onChange={change} maxLength={5000} required placeholder="Biện pháp và kết quả xử lý…" /></Field>}
    <FormActions busy={busy} onClose={onClose} label={kind === "progress" || kind === "issue" ? "Gửi báo cáo" : "Lưu"} />
  </form></Modal>;
}
function TaskDetails({ projectId, taskId, onClose, canManage, onResolve }) {
  const state = useRemote(projectPath(projectId, `/assignments/${taskId}`));
  return <Modal variant="drawer" title={state.data?.task.name || "Chi tiết công việc"} onClose={onClose}><RemoteState state={state}>{state.data && <div className="ops-task-details">
    <section><h3>Khối lượng</h3><p>Kế hoạch: {state.data.task.planned_quantity ? `${numberLabel(state.data.task.planned_quantity)} ${state.data.task.unit}` : "Chưa thiết lập"}</p>{state.data.progress.length ? <div className="ops-table-scroll"><table className="ops-table"><thead><tr><th>Ngày</th><th>Người báo</th><th>Khối lượng</th></tr></thead><tbody>{state.data.progress.map((entry) => <tr key={entry.id}><td>{dateLabel(entry.day)}<small>{entry.notes}</small></td><td>{entry.reported_by_name}<small>{entry.team_name} · {new Date(entry.created_at).toLocaleString("vi-VN")}</small></td><td>{numberLabel(entry.quantity)} {state.data.task.unit}</td></tr>)}</tbody></table></div> : <p className="ops-muted">Chưa có báo cáo khối lượng.</p>}</section>
    <section><h3>Vướng mắc</h3>{state.data.issues.length ? state.data.issues.map((issue) => <article className="ops-issue" key={issue.id}><span className={`ops-badge ops-badge-${issue.status === "closed" ? "green" : "orange"}`}>{issue.status === "closed" ? "Đã xử lý" : "Đang mở"}</span><p>{issue.description}</p><small>{issue.reported_by_name} · {new Date(issue.created_at).toLocaleString("vi-VN")}</small>{issue.resolution && <p className="ops-resolution">Xử lý: {issue.resolution}</p>}<div className="ops-photo-picker">{issue.photo_ids?.map((id) => <a href={photoUrl(projectId,id,true)} key={id} target="_blank" rel="noreferrer"><img src={photoUrl(projectId,id)} alt={`Ảnh vướng mắc ${id}`} /></a>)}</div>{canManage && issue.status === "open" && <button className="ops-btn ops-small" onClick={() => onResolve(issue)}>Ghi nhận xử lý</button>}</article>) : <p className="ops-muted">Chưa có vướng mắc.</p>}</section>
    {canManage && <section><h3>Lịch sử phân công</h3>{state.data.history.length ? <ol className="ops-assignment-history">{state.data.history.map((entry) => <li key={entry.id}><strong>{entry.previous_team_name ? `${entry.previous_team_name} → ` : "Giao việc → "}{entry.team_name}</strong><small>{entry.changed_by_name} · {new Date(entry.changed_at).toLocaleString("vi-VN")}</small></li>)}</ol> : <p className="ops-muted">Công việc chưa được phân công.</p>}</section>}
  </div>}</RemoteState></Modal>;
}
function weekBounds(day) {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  const start = date.toISOString().slice(0, 10); date.setUTCDate(date.getUTCDate() + 6);
  return [start, date.toISOString().slice(0, 10)];
}
function FieldTaskEditor({ projectId,task,tasks,onClose,onSaved }) {
  const items=useRemote(projectPath(projectId,"/lookup")),dependencies=useRemote(projectPath(projectId,"/dependencies"));
  if (!items.data || !dependencies.data) return <Modal title="Thông tin công việc" onClose={onClose}><RemoteState state={items}/><RemoteState state={dependencies}/></Modal>;
  return <ScheduleTaskEditor projectId={projectId} task={task || {}} items={items.data.items} tasks={tasks} dependencies={dependencies.data.dependencies} onClose={onClose} onDependencyAdded={dependencies.reload} onDependencyRemoved={dependencies.reload} onSave={async (id,values) => { await saveTask(projectId,id,values); onSaved("Đã lưu công việc. Tiến độ và đường găng được tính lại."); }} />;
}
function ProjectAssignments({ projectId, initialTaskId }) {
  const state = useRemote(projectPath(projectId, "/assignments"));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [teamId, setTeamId] = useState("");
  const [week, setWeek] = useState("");
  const [modal, setModal] = useState(validProjectId(initialTaskId) ? { kind: "details", task: { id: Number(initialTaskId) } } : null);
  const [notice, setNotice] = useState(null);
  const tasks = state.data?.tasks || [];
  const teams = state.data?.teams || [];
  const canManage = state.data?.can_manage;
  const worker = state.data?.member_role === "worker";
  const bounds = weekBounds(week);
  const visible = tasks.filter((task) => `${task.name} ${task.work_item_name}`.toLocaleLowerCase("vi-VN").includes(search.toLocaleLowerCase("vi-VN")) && (!status || (status === "late" ? task.is_late : status === "critical" ? task.isCritical : task.status === status)) && (!teamId || String(task.team_id) === teamId) && (!bounds || (task.start_date && task.finish_date >= bounds[0] && task.start_date <= bounds[1])));
  function saved(message, warning = false) { setModal(null); setNotice({ message, warning }); state.reload(); }
  return <><Notice tone={notice?.warning ? "warning" : "success"}>{notice?.message}</Notice><RemoteState state={state}>
    {state.data && <><AssignmentOverview tasks={tasks} teams={teams} onSelect={(task)=>setModal({kind:"details",task})} />
      {!state.data.project.start_date && <Notice tone="warning">Dự án chưa có ngày khởi công. <Link to={scopedLink("/projects", projectId)}>Cập nhật thông tin dự án</Link> để hiển thị ngày bắt đầu và kết thúc công việc.</Notice>}
      {worker && <Notice>Bạn đang xem công việc được giao cho đội của mình. Báo cáo khối lượng và vướng mắc được lưu theo từng công việc.</Notice>}
      <section className="ops-card"><div className="ops-card-head"><div><h2>Danh sách công việc ({visible.length})</h2><p>{state.data.project.name} · Ngày thi công theo lịch làm việc của dự án</p></div>{canManage && <div className="ops-actions"><button className="ops-btn ops-create" onClick={() => setModal({ kind: "task-create" })}>＋ Tạo công việc</button><button className="ops-btn" onClick={() => setModal({ kind: "team" })}>＋ Tạo đội thi công</button></div>}</div>
        <div className="ops-toolbar"><label className="ops-search">Tìm công việc<input type="search" placeholder="Tên công việc, hạng mục…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label>Trạng thái<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Tất cả trạng thái</option>{Object.entries(statuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}<option value="critical">Đường găng</option><option value="late">Trễ tiến độ</option></select></label><label>Đội thi công<select value={teamId} onChange={(event) => setTeamId(event.target.value)}><option value="">Tất cả đội</option>{teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label><label>Tuần chứa ngày<input type="date" value={week} onChange={(event) => setWeek(event.target.value)} /></label><button className="ops-btn" onClick={state.reload}>Tải lại</button></div>
        {bounds && <p className="ops-muted">Tuần {dateLabel(bounds[0])} – {dateLabel(bounds[1])} <button className="ops-link" onClick={() => setWeek("")}>· Bỏ lọc tuần</button></p>}
        {visible.length ? <div className="ops-table-scroll"><table className="ops-table ops-assignment-table"><thead><tr><th>Công việc</th><th>Hạng mục</th><th>Bắt đầu</th><th>Kết thúc</th><th>Đội phụ trách</th><th>Trạng thái</th><th>Đường găng</th><th>Thao tác</th></tr></thead><tbody>{visible.map((task) => <tr key={task.id} className={task.is_late ? "is-late" : ""}><td><button className="ops-link ops-task-name" onClick={() => setModal({ kind: "details", task })}>{task.name}</button><small>{task.planned_quantity ? `${numberLabel(task.reported_quantity)} / ${numberLabel(task.planned_quantity)} ${task.unit}` : "Chưa có khối lượng kế hoạch"}</small>{task.planned_quantity > 0 && <div className="assignment-progress" title={`${numberLabel(task.reported_quantity)} / ${numberLabel(task.planned_quantity)} ${task.unit}`}><span style={{width:`${Math.min(100,Number(task.reported_quantity)/Number(task.planned_quantity)*100)}%`}}/></div>}{task.open_issues > 0 && <small className="ops-issue-count">{task.open_issues} vướng mắc đang mở</small>}</td><td>{task.work_item_name}</td><td>{dateLabel(task.start_date)}</td><td>{dateLabel(task.finish_date)}{task.is_late && <small className="ops-late-text">Trễ tiến độ</small>}</td><td>{task.team_name || <span className="ops-muted">Chưa phân công</span>}</td><td><span className={`ops-badge ops-badge-${tones[task.status]}`}>{statuses[task.status]}</span></td><td>{task.isCritical ? <span className="ops-badge ops-badge-red">Găng</span> : "—"}</td><td><div className="ops-row-actions">{canManage && <><button className="ops-btn ops-small" onClick={() => setModal({ kind: "task-edit", task })}>Sửa việc</button><button className="ops-btn ops-small" onClick={() => setModal({ kind: "assign", task })}>{task.team_id ? "Đổi đội" : "Gán đội"}</button><button className="ops-btn ops-small" onClick={() => setModal({ kind: "quantity", task })}>Kế hoạch</button></>}{worker && <><button className="ops-btn ops-small" onClick={() => setModal({ kind: "progress", task })}>Báo khối lượng</button><button className="ops-btn ops-small" onClick={() => setModal({ kind: "issue", task })}>Vướng mắc</button></>}<button className="ops-btn ops-small" onClick={() => setModal({ kind: "details", task })}>Chi tiết</button></div></td></tr>)}</tbody></table></div> : <Empty><h2>{tasks.length ? "Không có công việc phù hợp" : "Chưa có công việc để hiển thị"}</h2><p>{worker ? "Công việc sẽ xuất hiện khi đội của bạn được phân công." : "Tạo công việc trong cây hạng mục, sau đó quay lại để phân công đội thi công."}</p>{canManage && <Link className="ops-btn" to={scopedLink("/work-items", projectId)}>Mở cây hạng mục</Link>}</Empty>}
      </section>
      {!!teams.length && <section className="ops-card"><h2>Đội thi công trong dự án</h2><div className="ops-team-grid">{teams.map((team) => <article className="ops-team-card" key={team.id}><span className="ops-team-symbol" aria-hidden="true"><Icon name="users" size={22}/></span><div><strong>{team.name}</strong><small>{team.members.length} thành viên · {tasks.filter((task) => task.team_id === team.id).length} công việc</small><p>{team.members.map((member) => member.fullname).join(", ")}</p></div></article>)}</div></section>}
    </>}
  </RemoteState>{modal?.kind === "team" && <TeamForm projectId={projectId} onClose={() => setModal(null)} onSaved={saved} />}{modal?.kind === "details" && <TaskDetails projectId={projectId} taskId={modal.task.id} canManage={canManage} onClose={() => setModal(null)} onResolve={(issue) => setModal({ kind: "resolve", task: issue })} />}{["task-create","task-edit"].includes(modal?.kind) && <FieldTaskEditor projectId={projectId} task={modal.task} tasks={tasks} onClose={() => setModal(null)} onSaved={saved} />}{modal && !["team", "details","task-create","task-edit"].includes(modal.kind) && <TaskForm {...modal} teams={teams} projectId={projectId} onClose={() => setModal(null)} onSaved={saved} />}</>;
}
export default function FieldAssignments() {
  const [params] = useSearchParams();
  const projectId = params.get("projectId");
  return <DashboardLayout title="Giao việc hiện trường" description="Phân công đội thi công, theo dõi khối lượng và xử lý vướng mắc tại công trường.">{validProjectId(projectId) ? <ProjectAssignments key={`${projectId}:${params.get("taskId") || ""}`} projectId={projectId} initialTaskId={params.get("taskId")} /> : <NoProject />}</DashboardLayout>;
}
