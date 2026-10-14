import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import Icon from "../components/OperationsIcon";
import { StatusDistribution } from "../components/OperationsVisuals";
import { Modal, Notice, RemoteState } from "../components/OperationsUI";
import useRemote from "../hooks/useRemote";
import { api, dateLabel, projectStatuses, today } from "../services/operationsApi";
import { scopedLink } from "../services/navigation";
import "../styles/Projects.css";

const managers = ["admin", "project_manager", "manager"];
// Worker assignments contain only their own team's tasks, not project totals.
const canReadTotals = (project) => [...managers, "engineer", "viewer"].includes(project.member_role);
const statusLabels = { ...projectStatuses, planned: "Chưa bắt đầu" };
const normalize = (text) => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLocaleLowerCase("vi-VN");
const progressValue = (project) => project.progress == null || !Number.isFinite(Number(project.progress)) ? null : Math.max(0, Math.min(100, Number(project.progress)));

function ProjectStatus({ project }) {
  return <span className={`project-status status-${project.status}`}><span />{statusLabels[project.status] || "Chưa xác định"}</span>;
}

function ProjectProgress({ project }) {
  const value = progressValue(project);
  return <div className={`project-progress ${value === null ? "is-unknown" : ""}`}>
    <div><span>Tiến độ thi công</span><strong>{value === null ? "Chưa xác định" : `${value.toLocaleString("vi-VN")}%`}</strong></div>
    {value === null ? <div className="project-progress-track" aria-label="Chưa có đủ dữ liệu tiến độ" /> : <progress value={value} max="100" aria-label={`Tiến độ ${project.name}`} />}
  </div>;
}

function ProjectForm({ project, onClose, onSaved }) {
  const formRef = useRef(null);
  useEffect(() => { formRef.current?.elements.namedItem("name")?.focus(); }, []);
  const [values, setValues] = useState({ name: project?.name || "", location: project?.location || "", start_date: project?.start_date?.slice(0, 10) || today(), ...(project ? { status: project.status } : {}) });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const validate = (name, value) => {
    if (!value.trim()) return { name: "Vui lòng nhập tên dự án.", location: "Vui lòng nhập địa điểm công trình.", start_date: "Vui lòng chọn ngày khởi công." }[name];
    if (name === "start_date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "9999-12-31")) return "Ngày khởi công không hợp lệ.";
    return "";
  };
  const change = (event) => {
    const { name, value } = event.target;
    setValues((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: "" }));
  };
  async function submit(event) {
    event.preventDefault();
    const invalid = Object.fromEntries(["name", "location", "start_date"].map((name) => [name, validate(name, values[name])]));
    setErrors(invalid);
    const first = Object.keys(invalid).find((name) => invalid[name]);
    if (first) { event.currentTarget.elements.namedItem(first).focus(); return; }
    setBusy(true); setError("");
    try {
      const result = await api(project ? `/projects/${project.id}/overview` : "/projects", { method: project ? "PATCH" : "POST", body: { ...values, name: values.name.trim(), location: values.location.trim() } });
      onSaved(result.project);
    } catch (failure) { setError(failure.message); setBusy(false); }
  }
  return <Modal className="project-modal" title={project ? "Chỉnh sửa dự án" : "Tạo dự án mới"} onClose={onClose} busy={busy}>
    <div className="project-modal-intro"><span className="project-symbol"><Icon name="building" size={26} /></span><p>{project ? "Cập nhật thông tin công trình và trạng thái triển khai." : "Khởi tạo không gian làm việc cho công trình của bạn."}<small>Bạn có thể bổ sung thành viên và kế hoạch sau khi tạo.</small></p></div>
    <Notice tone="error">{error}</Notice>
    <form ref={formRef} noValidate onSubmit={submit}>
      <fieldset disabled={busy}>
        {[{ name: "name", label: "Tên dự án", placeholder: "Nhập tên dự án", icon: "building", max: 255 }, { name: "location", label: "Địa điểm", placeholder: "Nhập địa chỉ công trình", icon: "pin", max: 1000 }, { name: "start_date", label: "Ngày khởi công", icon: "calendar", type: "date" }].map((field) => <div className="project-field" key={field.name}>
          <label htmlFor={`project-${field.name}`}>{field.label}<span aria-hidden="true"> *</span></label>
          <div className={`project-input-wrap ${errors[field.name] ? "has-error" : ""}`}><Icon name={field.icon} size={18} /><input id={`project-${field.name}`} name={field.name} type={field.type || "text"} value={values[field.name]} onChange={change} placeholder={field.placeholder} maxLength={field.max} {...(field.type === "date" ? { min: "1900-01-01", max: "9999-12-31" } : {})} required aria-invalid={Boolean(errors[field.name])} aria-describedby={errors[field.name] ? `error-${field.name}` : undefined} /></div>
          {errors[field.name] && <p className="project-field-error" id={`error-${field.name}`}>{errors[field.name]}</p>}
        </div>)}
        {project && <div className="project-field"><label htmlFor="project-status">Trạng thái</label><select id="project-status" name="status" value={values.status} onChange={change}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
      </fieldset>
      <div className="project-form-footnote"><Icon name="help" size={15} /><span>Các trường có dấu * là bắt buộc.</span></div>
      <footer className="ops-form-actions"><button className="ops-btn" type="button" disabled={busy} onClick={onClose}>Hủy</button><button className="ops-btn ops-create" disabled={busy} type="submit">{busy ? <><span className="ops-spinner" />Đang lưu…</> : <><Icon name={project ? "check" : "plus"} size={18} />{project ? "Lưu thay đổi" : "Tạo dự án"}</>}</button></footer>
    </form>
  </Modal>;
}

function menuPosition(button, role) {
  const rect = button.getBoundingClientRect();
  const height = ([...managers, "engineer", "viewer"].includes(role) ? 38 : 0) + (managers.includes(role) ? 38 : 0) + 86;
  return { left: Math.max(12, Math.min(rect.right - 215, window.innerWidth - 227)), top: rect.bottom + height + 12 < window.innerHeight ? rect.bottom + 7 : Math.max(12, rect.top - height - 7) };
}

function ProjectMenu({ project, onEdit, onDetails }) {
  const ref = useRef(null);
  const panel = useRef(null);
  const [position, setPosition] = useState(null);
  const open = Boolean(position);
  useEffect(() => {
    if (!open) return;
    const close = (event) => { if (!ref.current?.contains(event.target) && !panel.current?.contains(event.target)) setPosition(null); };
    const keyboard = (event) => { if (event.key === "Escape") { setPosition(null); ref.current?.focus(); } };
    const reposition = () => { if (ref.current) setPosition(menuPosition(ref.current, project.member_role)); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", keyboard);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    panel.current?.querySelector("button, a")?.focus({ preventScroll: true });
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", keyboard); window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); };
  }, [open, project.member_role]);
  function toggle() {
    if (position) { setPosition(null); return; }
    setPosition(menuPosition(ref.current, project.member_role));
  }
  return <div className="project-menu">
    <button ref={ref} aria-label={`Thao tác dự án ${project.name}`} aria-expanded={Boolean(position)} title="Thao tác dự án" onClick={toggle}><Icon name="more" /></button>
    {position && createPortal(<div ref={panel} className="project-menu-panel" style={position} onKeyDown={(event) => { if (event.key === "Tab") { const items = [...panel.current.querySelectorAll("button,a")]; const next = items.indexOf(document.activeElement) + (event.shiftKey ? -1 : 1); if (next < 0 || next >= items.length) { event.preventDefault(); setPosition(null); ref.current.focus(); } } }} onClick={() => { setPosition(null); ref.current?.focus(); }}>
      {canReadTotals(project) && <button onClick={() => onDetails(project)}><Icon name="chart" size={17} />Chi tiết tiến độ</button>}
      <Link to={scopedLink("/members", project.id)}><Icon name="users" size={17} />Thành viên dự án</Link>
      <Link to={scopedLink("/calendar", project.id)}><Icon name="calendar" size={17} />Lịch làm việc</Link>
      {managers.includes(project.member_role) && <button onClick={() => onEdit(project)}><Icon name="edit" size={17} />Chỉnh sửa dự án</button>}
    </div>, document.body)}
  </div>;
}

function ProjectDetails({ project, onClose, onLoaded }) {
  const tasks = useRemote(`/projects/${project.id}/assignments`);
  const members = useRemote(`/projects/${project.id}/members`);
  useEffect(() => {
    if (!tasks.data) return;
    const rows = tasks.data.tasks;
    const finishDates = rows.map((task) => task.finish_date).filter(Boolean).sort();
    onLoaded(project.id, { task_count: rows.length, critical_count: rows.filter((task) => task.isCritical).length, delayed_count: rows.filter((task) => task.is_late).length, finish_date: finishDates.at(-1) || null, manager: members.data?.members.filter((member) => managers.includes(member.role)).map((member) => member.fullname).join(", ") || "" });
  }, [tasks.data, members.data, project.id, onLoaded]);
  return <Modal className="project-modal project-detail-modal" title="Chi tiết tiến độ" onClose={onClose}>
    <div className="project-detail-heading"><span className="project-symbol"><Icon name="building" size={26} /></span><div><h3>{project.name}</h3><p>{project.location}</p></div><ProjectStatus project={project} /></div>
    <RemoteState state={tasks}>{tasks.data && <>
      <div className="project-detail-stats">{[["Công việc", tasks.data.tasks.length, "task"], ["Trên đường găng", tasks.data.tasks.filter((task) => task.isCritical).length, "trend"], ["Đang chậm", tasks.data.tasks.filter((task) => task.is_late).length, "clock"]].map(([label, value, icon]) => <div key={label}><Icon name={icon} /><strong>{value}</strong><span>{label}</span></div>)}</div>
      <ProjectProgress project={project} />
      <p className="project-detail-note">{progressValue(project) === null ? "Tiến độ sẽ được xác định khi tất cả công việc có khối lượng kế hoạch." : "Tiến độ dựa trên khối lượng đã báo cáo và kế hoạch của từng công việc."}</p>
      <div className="project-detail-dates"><div><span>Ngày khởi công</span><strong>{dateLabel(project.start_date)}</strong></div><div><span>Hoàn thành dự kiến</span><strong>{dateLabel(tasks.data.tasks.map((task) => task.finish_date).filter(Boolean).sort().at(-1))}</strong></div></div>
      {members.data && <div className="project-detail-managers"><Icon name="users" size={18} /><div><span>Ban quản lý / chỉ huy trưởng</span><strong>{members.data.members.filter((member) => managers.includes(member.role)).map((member) => member.fullname).join(", ") || "Chưa phân công"}</strong></div></div>}
      {!tasks.data.tasks.length && <p className="project-detail-note">Dự án chưa có công việc. Thêm hạng mục và công việc để bắt đầu lập tiến độ.</p>}
      <footer className="ops-form-actions"><button className="ops-btn" onClick={onClose}>Đóng</button><Link className="ops-btn ops-primary" to={scopedLink("/field-assignments", project.id)}>Xem công việc<Icon name="arrow" size={17} /></Link></footer>
    </>}</RemoteState>
  </Modal>;
}

function ProjectCard({ project, summary, selected, onEdit, onDetails }) {
  return <article className={`ops-project-card ${selected ? "is-selected" : ""}`}>
    <div className={`project-card-top tone-${project.status}`}><span className="project-symbol"><Icon name="building" size={29} /></span><ProjectStatus project={project} /><span className="project-card-pattern" aria-hidden="true"><Icon name="building" size={88} /></span></div>
    <div className="project-card-content">
      <div className="project-card-title"><h3><Link to={scopedLink("/home", project.id)}>{project.name}</Link></h3>{selected && <span className="project-selected" title="Dự án hiện tại"><Icon name="check" size={17} /><span>Đang chọn</span></span>}</div>
      <p className="project-location"><Icon name="pin" size={15} /><span title={project.location}>{project.location || "Chưa cập nhật địa điểm"}</span></p>
      {summary?.manager && <p className="project-manager"><Icon name="users" size={14} /><span title={summary.manager}>{summary.manager}</span></p>}
      <dl className="project-dates"><div><dt><Icon name="calendar" size={14} />Khởi công</dt><dd>{dateLabel(project.start_date)}</dd></div><div><dt><Icon name="clock" size={14} />Hoàn thành dự kiến</dt><dd>{summary ? dateLabel(summary.finish_date) : "Chưa cập nhật"}</dd></div></dl>
      <ProjectProgress project={project} />
      <div className="project-card-metrics"><Link to={scopedLink("/members", project.id)} title="Xem thành viên"><Icon name="users" size={18} /><strong>{project.member_count} người</strong><span>Thành viên</span></Link><div title={summary ? "Tổng công việc trong dự án" : "Xem chi tiết tiến độ để tải thống kê"}><Icon name="task" size={18} /><strong>{summary?.task_count ?? "—"}</strong><span>Công việc</span></div><div className="project-critical" title={summary ? "Công việc trên đường găng" : "Xem chi tiết tiến độ để tải thống kê"}><Icon name="trend" size={18} /><strong>{summary?.critical_count ?? "—"}</strong><span>Đường găng</span></div></div>
      {summary?.delayed_count > 0 && <div className="project-delay-note"><Icon name="warning" size={14} />{summary.delayed_count} công việc đang chậm tiến độ</div>}
    </div>
    <footer className="project-card-footer"><Link className="ops-btn project-open" to={scopedLink("/home", project.id)}>Mở dự án<Icon name="arrow" size={17} /></Link>{canReadTotals(project) && <button className="project-detail-button" onClick={() => onDetails(project)}>Chi tiết</button>}<ProjectMenu project={project} onEdit={onEdit} onDetails={onDetails} /></footer>
  </article>;
}

function ProjectSkeleton() {
  return <div className="project-loading" role="status" aria-label="Đang tải danh sách dự án"><div className="project-kpis">{[1, 2, 3, 4].map((key) => <div className="project-kpi" key={key}><span className="project-skeleton skeleton-icon" /><div><span className="project-skeleton skeleton-value" /><span className="project-skeleton skeleton-line" /></div></div>)}</div><div className="project-skeleton skeleton-toolbar" /><div className="ops-project-grid">{[1, 2, 3].map((key) => <div className="project-skeleton-card" key={key}><div className="project-skeleton skeleton-cover" /><div>{[1, 2, 3, 4].map((line) => <span className="project-skeleton skeleton-line" key={line} />)}<div className="project-skeleton skeleton-button" /></div></div>)}</div></div>;
}

function PortfolioOverview({ projects, current, delayed }) {
  const recent = [...projects].sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at))).slice(0, 3);
  return <section className="portfolio-overview" aria-label="Tổng quan danh mục dự án">
    <div className="portfolio-current"><span className="portfolio-eyebrow"><Icon name="building" size={16} />DANH MỤC CÔNG TRÌNH</span><div className="portfolio-current-heading"><div><h2>{current?.name || "Không gian dự án của bạn"}</h2><p>{current?.location || "Theo dõi các công trình và kết nối đội ngũ thi công."}</p></div>{current && <ProjectStatus project={current} />}</div><div className="portfolio-context"><div><strong>{projects.length}</strong><span>Dự án tham gia</span></div><div><strong>{projects.reduce((sum, project) => sum + Number(project.member_count || 0), 0)}</strong><span>Lượt thành viên dự án</span></div><div className={delayed ? "has-risk" : ""}><strong>{delayed ?? "—"}</strong><span>Dự án chậm tiến độ</span></div></div>{current && <div className="portfolio-current-foot"><span><Icon name="calendar" size={14} />Khởi công {dateLabel(current.start_date)}</span><Link to={scopedLink("/home", current.id)}>Tổng quan dự án<Icon name="arrow" size={15} /></Link></div>}</div>
    <div className="portfolio-distribution"><StatusDistribution title="Tình trạng triển khai" total={projects.length} label="Dự án" entries={[["active", "Đang triển khai", "#1677ff"], ["planned", "Chưa bắt đầu", "#a4b1c5"], ["on_hold", "Tạm dừng", "#fb923c"], ["completed", "Hoàn thành", "#17b26a"]].map(([status, label, color]) => ({ label, color, value: projects.filter((project) => project.status === status).length }))} /></div>
    {recent.length > 0 && <div className="portfolio-recent"><span><Icon name="clock" size={15} />Cập nhật gần nhất</span>{recent.map((project) => <Link key={project.id} to={scopedLink("/home", project.id)}><span>{project.name}</span><small>{dateLabel((project.updated_at || project.created_at)?.slice(0, 10))}</small></Link>)}</div>}
  </section>;
}

export default function Projects() {
  const state = useRemote("/projects");
  const [params, setParams] = useSearchParams();
  const search = params.get("q") || "";
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("updated");
  const [view, setView] = useState("grid");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [modal, setModal] = useState(null);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [summaries, setSummaries] = useState({});
  const onLoaded = useCallback((id, summary) => setSummaries((previous) => ({ ...previous, [id]: summary })), []);
  const projects = state.data?.projects || [];
  const filtered = projects.filter((project) => (!status || project.status === status) && normalize(`${project.name} ${project.location}`).includes(normalize(search.trim()))).sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "vi");
    if (sort === "progress") return (progressValue(b) ?? -1) - (progressValue(a) ?? -1) || b.id - a.id;
    return String(b[sort === "start" ? "start_date" : "updated_at"] || b.created_at || "").localeCompare(String(a[sort === "start" ? "start_date" : "updated_at"] || a.created_at || "")) || b.id - a.id;
  });
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  const assessed = projects.filter((project) => summaries[project.id]);
  const delayed = projects.length === assessed.length ? assessed.filter((project) => summaries[project.id].delayed_count > 0).length : null;
  function setSearch(value) { setParams((previous) => { const next = new URLSearchParams(previous); if (value) next.set("q", value); else next.delete("q"); return next; }, { replace: true }); setPage(1); }
  function resetFilters() { setSearch(""); setStatus(""); setPage(1); }
  function refresh() { state.reload(); setSummaries({}); setRevision((value) => value + 1); }
  function saved(project) {
    setModal(null); setMessage(`Đã lưu dự án “${project.name}”.`); setParams({ projectId: project.id }); setStatus(""); setPage(1); refresh();
  }
  const createButton = <button className="ops-btn ops-create" onClick={() => setModal({ type: "form" })}><Icon name="plus" size={20} />Tạo dự án</button>;
  return <DashboardLayout className="projects-page" headingIcon="folder" title="Dự án" description="Quản lý và theo dõi toàn bộ dự án bạn đang tham gia." refreshKey={revision} actions={state.data?.can_create && createButton}>
    {message && <div className="project-success" role="status"><Icon name="check" /><span>{message}</span><button aria-label="Đóng thông báo" onClick={() => setMessage("")}><Icon name="close" size={17} /></button></div>}
    {state.loading ? <ProjectSkeleton /> : state.error ? <section className="project-state project-error" role="alert"><span className="project-state-icon"><Icon name="warning" size={32} /></span><h2>Không thể tải danh sách dự án</h2><p>{state.error.message}</p>{state.error.status === 401 ? <Link className="ops-btn ops-primary" to="/login">Đăng nhập lại</Link> : <button className="ops-btn ops-primary" onClick={refresh}><Icon name="refresh" size={17} />Thử lại</button>}</section> : <>
      <PortfolioOverview projects={projects} current={projects.find((project) => project.id === Number(params.get("projectId"))) || projects[0]} delayed={delayed} />
      <section className="project-collection" aria-labelledby="project-list-title">
        <div className="project-collection-heading"><div><h2 id="project-list-title">Danh sách dự án <span>{projects.length}</span></h2><p>Theo dõi công trình, kết nối đội ngũ và kiểm soát tiến độ.</p></div><button className="project-refresh" onClick={refresh} aria-label="Tải lại danh sách dự án"><Icon name="refresh" size={17} /><span>Làm mới</span></button></div>
        <div className="project-toolbar"><label className="project-search"><span className="project-visually-hidden">Tìm kiếm dự án</span><Icon name="search" size={19} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm kiếm dự án..." /></label>
          <label className="project-filter"><span className="project-visually-hidden">Trạng thái dự án</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Tất cả trạng thái</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label className="project-sort"><span className="project-visually-hidden">Sắp xếp dự án</span><select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="updated">Cập nhật gần nhất</option><option value="name">Tên dự án A – Z</option><option value="start">Khởi công gần nhất</option><option value="progress">Tiến độ cao nhất</option></select></label>
          <div className="project-view-switch" role="group" aria-label="Chế độ hiển thị"><button aria-label="Dạng lưới" aria-pressed={view === "grid"} title="Dạng lưới" onClick={() => setView("grid")}><Icon name="grid" size={18} /></button><button aria-label="Dạng danh sách" aria-pressed={view === "list"} title="Dạng danh sách" onClick={() => setView("list")}><Icon name="list" size={20} /></button></div>
        </div>
        {(search || status) && <div className="project-filter-summary"><span><strong>{filtered.length}</strong> dự án phù hợp{search && ` với “${search}”`}</span><button onClick={resetFilters}>Xóa bộ lọc<Icon name="close" size={14} /></button></div>}
        {!visible.length ? <div className="project-state"><span className="project-state-icon"><Icon name={projects.length ? "search" : "folder"} size={37} /></span><h2>{projects.length ? "Không tìm thấy dự án phù hợp" : "Chưa có dự án"}</h2><p>{projects.length ? "Thử tìm bằng tên hoặc địa điểm khác, hoặc xóa bộ lọc hiện tại." : state.data?.can_create ? "Bắt đầu bằng cách tạo dự án đầu tiên." : "Liên hệ ban quản lý để được thêm vào dự án."}</p>{projects.length ? <button className="ops-btn ops-primary" onClick={resetFilters}>Xóa bộ lọc</button> : state.data?.can_create && createButton}</div>
          : view === "grid" ? <div className="ops-project-grid">{visible.map((project) => <ProjectCard key={project.id} project={project} summary={summaries[project.id]} selected={Number(params.get("projectId")) === project.id} onEdit={(project) => setModal({ type: "form", project })} onDetails={(project) => setModal({ type: "details", project })} />)}</div>
            : <div className="project-table-scroll" tabIndex={0} role="region" aria-label="Danh sách dự án"><table className="project-table"><thead><tr><th>Dự án</th><th>Trạng thái</th><th>Khởi công</th><th>Tiến độ</th><th>Thành viên</th><th><span className="project-visually-hidden">Thao tác</span></th></tr></thead><tbody>{visible.map((project) => <tr key={project.id} className={Number(params.get("projectId")) === project.id ? "is-selected" : ""}><td><div className="project-table-name"><span className="project-symbol"><Icon name="building" size={24} /></span><div><Link to={scopedLink("/home", project.id)}>{project.name}</Link><small>{project.location || "Chưa cập nhật địa điểm"}</small></div></div></td><td><ProjectStatus project={project} /></td><td>{dateLabel(project.start_date)}</td><td><ProjectProgress project={project} /></td><td><Link to={scopedLink("/members", project.id)}>{project.member_count} người</Link></td><td><div className="project-table-actions"><Link className="ops-btn project-open" to={scopedLink("/home", project.id)} aria-label={`Mở dự án ${project.name}`}><Icon name="arrow" size={17} /></Link><ProjectMenu project={project} onEdit={(project) => setModal({ type: "form", project })} onDetails={(project) => setModal({ type: "details", project })} /></div></td></tr>)}</tbody></table></div>}
        {filtered.length > 0 && <footer className="project-pagination"><p>Hiển thị <strong>{start + 1}–{Math.min(start + pageSize, filtered.length)}</strong> trong <strong>{filtered.length}</strong> dự án</p><div><label><span className="project-visually-hidden">Số dự án mỗi trang</span><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{[6, 12, 24].map((size) => <option value={size} key={size}>{size} / trang</option>)}</select></label><button aria-label="Trang trước" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><Icon name="left" size={17} /></button><span className="project-page-number" aria-live="polite">{currentPage} / {pages}</span><button aria-label="Trang sau" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><Icon name="right" size={17} /></button></div></footer>}
      </section>
      {!!projects.length && <p className="project-data-note"><Icon name="help" size={16} /><span>Dấu “—” là chỉ số chưa được cập nhật.{projects.some(canReadTotals) ? <> Mở <strong>Chi tiết</strong> để xem thống kê công việc và mốc hoàn thành của từng dự án.</> : " Thống kê chi tiết hiển thị theo quyền truy cập của bạn."}</span></p>}
    </>}
    {modal?.type === "form" && <ProjectForm project={modal.project} onClose={() => setModal(null)} onSaved={saved} />}
    {modal?.type === "details" && <ProjectDetails project={modal.project} onClose={() => setModal(null)} onLoaded={onLoaded} />}
  </DashboardLayout>;
}
