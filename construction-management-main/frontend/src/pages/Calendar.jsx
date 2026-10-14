import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import Icon from "../components/OperationsIcon";
import { SectionHeading } from "../components/OperationsVisuals";
import { Empty, Field, FormActions, Modal, NoProject, Notice, RemoteState } from "../components/OperationsUI";
import useRemote from "../hooks/useRemote";
import { api, dateLabel, projectPath, today } from "../services/operationsApi";
import { validProjectId } from "../services/navigation";
import "../styles/Calendar.css";

const days = [[1, "Thứ 2"], [2, "Thứ 3"], [3, "Thứ 4"], [4, "Thứ 5"], [5, "Thứ 6"], [6, "Thứ 7"], [0, "Chủ nhật"]];
function MonthCalendar({ calendar, holidays, project }) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(year, monthNumber - 1, 1);
  const offset = (start.getDay() + 6) % 7;
  const count = new Date(year, monthNumber, 0).getDate();
  const cells = Array.from({length: Math.ceil((offset + count) / 7) * 7}, (_, index) => {
    const date = new Date(year, monthNumber - 1, index - offset + 1);
    const iso = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    return { date, iso, holiday: holidays.find((entry)=>entry.day.slice(0,10) === iso), working: calendar.working_days.includes(date.getDay()), current: date.getMonth() === monthNumber - 1 };
  });
  const workingCount = cells.filter((cell)=>cell.current && cell.working && !cell.holiday).length;
  function moveMonth(delta) { const next = new Date(year, monthNumber-1+delta,1); setMonth(`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,"0")}`); }
  return <section className="ops-card calendar-month"><SectionHeading icon="calendar" title="Lịch thi công" description={`${project?.name || "Dự án"} · Khởi công ${dateLabel(project?.start_date)}`} /><div className="calendar-month-toolbar"><h2>Tháng {monthNumber}, {year}</h2><div><button className="ops-btn ops-small" aria-label="Tháng trước" onClick={()=>moveMonth(-1)}><Icon name="left" size={16}/></button><button className="ops-btn ops-small" onClick={()=>setMonth(today().slice(0,7))}>Hôm nay</button><button className="ops-btn ops-small" aria-label="Tháng sau" onClick={()=>moveMonth(1)}><Icon name="right" size={16}/></button></div></div><div className="calendar-month-grid" aria-label={`Lịch tháng ${monthNumber} năm ${year}`}>{days.map(([,label])=><div className="calendar-week-label" key={label}>{label}</div>)}{cells.map((cell)=><div className={`calendar-day ${!cell.current ? "is-outside" : ""} ${cell.holiday ? "is-holiday" : !cell.working ? "is-rest" : "is-working"} ${cell.iso===today() ? "is-today" : ""}`} key={cell.iso} aria-label={`${dateLabel(cell.iso)}: ${cell.holiday?.name || (cell.working ? "Làm việc" : "Nghỉ")}`}><span>{cell.date.getDate()}</span>{cell.holiday ? <small title={cell.holiday.name}>{cell.holiday.name}</small> : !cell.working ? <small>Nghỉ</small> : null}{project?.start_date?.slice(0,10)===cell.iso && <small className="calendar-start">Khởi công</small>}</div>)}</div><div className="calendar-legend"><span><i className="working"/>Ngày làm việc</span><span><i className="rest"/>Nghỉ hằng tuần</span><span><i className="holiday"/>Ngày lễ / nghỉ riêng</span></div><div className="calendar-month-count"><strong>{workingCount}</strong><span>ngày làm việc trong tháng theo lịch đã lưu</span></div></section>;
}
function WeekForm({ projectId, calendar, canManage, onSaved }) {
  const [selected, setSelected] = useState(calendar.working_days);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changed = [...selected].sort().join() !== [...calendar.working_days].sort().join();
  async function save(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api(projectPath(projectId, "/calendar"), { method: "PUT", body: { working_days: selected, revision: calendar.revision } }); onSaved("Đã lưu tuần làm việc. Các mốc công việc sẽ dùng lịch mới."); }
    catch (failure) { setError(failure.message); setBusy(false); }
  }
  return <form onSubmit={save}><div className="ops-weekdays">{days.map(([day, label]) => <label className={`ops-weekday ${selected.includes(day) ? "is-working" : ""}`} key={day}><input type="checkbox" checked={selected.includes(day)} disabled={!canManage || busy} onChange={(event) => setSelected(event.target.checked ? [...selected, day] : selected.filter((value) => value !== day))} /><strong>{label}</strong><span>{selected.includes(day) ? "Làm việc" : "Nghỉ"}</span></label>)}</div>
    <Notice tone="error">{error}</Notice><div className="ops-week-footer"><span>{selected.length} ngày làm việc / tuần {changed && "· Có thay đổi chưa lưu"}</span>{canManage && <button className="ops-btn ops-primary" disabled={busy || !changed || !selected.length}>{busy ? "Đang lưu…" : "Lưu lịch làm việc"}</button>}</div>
  </form>;
}
function HolidayForm({ projectId, holiday, deleting, onClose, onSaved }) {
  const [values, setValues] = useState(holiday || { day: today(), name: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = (event) => setValues({ ...values, [event.target.name]: event.target.value });
  async function save(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api(projectPath(projectId, `/holidays${holiday ? `/${holiday.id}` : ""}`), { method: deleting ? "DELETE" : holiday ? "PUT" : "POST", ...(deleting ? {} : { body: values }) }); onSaved(deleting ? "Đã xóa ngày nghỉ." : "Đã lưu ngày nghỉ."); }
    catch (failure) { setError(failure.message); setBusy(false); }
  }
  return <Modal title={deleting ? "Xóa ngày nghỉ" : holiday ? "Chỉnh sửa ngày nghỉ" : "Thêm ngày nghỉ"} busy={busy} onClose={onClose}><Notice tone="error">{error}</Notice><form onSubmit={save}>{deleting ? <p>Xóa “{holiday.name}” ({dateLabel(holiday.day)}) khỏi lịch dự án?</p> : <>
    <Field label="Ngày nghỉ"><input type="date" name="day" value={values.day} min="1900-01-01" max="9999-12-31" required onChange={change} /></Field><Field label="Tên ngày nghỉ"><input autoFocus name="name" value={values.name} required maxLength={255} onChange={change} placeholder="Ví dụ: Quốc khánh" /></Field><Field label="Ghi chú"><textarea name="notes" value={values.notes} maxLength={2000} onChange={change} /></Field></>}
    <FormActions busy={busy} onClose={onClose} label={deleting ? "Xóa ngày nghỉ" : "Lưu ngày nghỉ"} /></form></Modal>;
}
function ProjectCalendar({ projectId }) {
  const calendar = useRemote(projectPath(projectId, "/calendar"));
  const project = useRemote(projectPath(projectId, "/overview"));
  const [modal, setModal] = useState(null);
  const [message, setMessage] = useState("");
  const canManage = ["admin", "project_manager", "manager"].includes(project.data?.project.member_role);
  function saved(text) { setModal(null); setMessage(text); calendar.reload(); }
  return <><Notice tone="success">{message}</Notice><RemoteState state={project}><RemoteState state={calendar}>
    {calendar.data && <div className="calendar-layout"><MonthCalendar calendar={calendar.data.calendar} holidays={calendar.data.holidays} project={project.data?.project}/><aside className="calendar-settings"><section className="ops-card"><div className="ops-card-head"><div><h2>Tuần làm việc</h2><p>Cấu hình lặp lại mỗi tuần</p></div><span className="ops-badge">{canManage ? "Cấu hình dự án" : "Chỉ xem"}</span></div><WeekForm key={calendar.data.calendar.revision} projectId={projectId} calendar={calendar.data.calendar} canManage={canManage} onSaved={saved} /><div className="ops-calendar-note">Ngày nghỉ hằng tuần và ngày lễ được loại khỏi lịch thi công. Ngày lễ trùng ngày nghỉ chỉ tính một lần.</div></section>
      <section className="ops-card calendar-holidays"><div className="ops-card-head"><div><h2>Ngày nghỉ / ngày lễ</h2><p>{calendar.data.holidays.length} ngày nghỉ riêng của dự án</p></div>{canManage && <button className="ops-btn ops-create" onClick={() => setModal({})}><Icon name="plus" size={15}/>Thêm ngày nghỉ</button>}</div>
        {calendar.data.holidays.length ? <div className="ops-table-scroll"><table className="ops-table"><thead><tr><th>Ngày</th><th>Tên ngày nghỉ</th><th>Ghi chú</th>{canManage && <th>Thao tác</th>}</tr></thead><tbody>{calendar.data.holidays.map((holiday) => <tr key={holiday.id}><td>{dateLabel(holiday.day)}</td><td>{holiday.name}</td><td>{holiday.notes || "—"}</td>{canManage && <td><div className="ops-row-actions"><button className="ops-btn ops-small" onClick={() => setModal({ holiday })}>Sửa</button><button className="ops-btn ops-small ops-danger" onClick={() => setModal({ holiday, deleting: true })}>Xóa</button></div></td>}</tr>)}</tbody></table></div> : <Empty>Chưa có ngày nghỉ riêng. Lịch hiện áp dụng theo tuần làm việc ở trên.</Empty>}
      </section></aside></div>}
  </RemoteState></RemoteState>{modal && <HolidayForm projectId={projectId} {...modal} onClose={() => setModal(null)} onSaved={saved} />}</>;
}
export default function Calendar() {
  const [params] = useSearchParams();
  const projectId = params.get("projectId");
  return <DashboardLayout title="Lịch làm việc" description="Thiết lập ngày làm việc và ngày nghỉ để lập tiến độ phù hợp với công trường.">{validProjectId(projectId) ? <ProjectCalendar key={projectId} projectId={projectId} /> : <NoProject />}</DashboardLayout>;
}
