import { useEffect,useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import useRemote from "../hooks/useRemote";
import OperationsIcon from "./OperationsIcon";
import PwaUpdate from "./PwaUpdate";
import SidebarLogout from "./SidebarLogout";
import { Modal } from "./OperationsUI";
import { roleLabels } from "../services/operationsApi";
import { navigation, scopedLink, validProjectId,visibleNavigation } from "../services/navigation";
import "../styles/Operations.css";
import "../styles/OperationsPolish.css";

function NotificationLink({ projectId,state }) {
  return <Link className="ops-shell-bell" to={scopedLink("/notifications", projectId)} aria-label={`Thông báo${state.data?.unread_count ? `, ${state.data.unread_count} chưa đọc` : ""}`}><OperationsIcon name="bell" />{state.data?.unread_count > 0 && <span>{state.data.unread_count}</span>}</Link>;
}
export default function DashboardLayout({ title, description, actions, children, refreshKey = "", className = "", headingIcon }) {
  const [params] = useSearchParams();
  const projectId = params.get("projectId");
  const location = useLocation();
  const pageIcon = headingIcon || navigation.find((entry) => entry[1] === location.pathname)?.[2] || "folder";
  const navigate = useNavigate();
  const projects = useRemote("/projects", `${projectId}:${refreshKey}`);
  const [permissionRevision,setPermissionRevision]=useState(0);
  const account = useRemote("/auth/me",`${refreshKey}:${permissionRevision}`);
  useEffect(() => { const changed=() => setPermissionRevision(v => v+1); window.addEventListener("xds-permissions-changed",changed); return () => window.removeEventListener("xds-permissions-changed",changed); },[]);
  const [notificationRevision,setNotificationRevision] = useState(0);
  const feed = useRemote(validProjectId(projectId) ? `/projects/${projectId}/notifications` : null,notificationRevision);
  useEffect(() => { const changed=() => setNotificationRevision((value) => value+1); window.addEventListener("xds-notifications-changed",changed); return () => window.removeEventListener("xds-notifications-changed",changed); },[]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const current = projects.data?.projects.find((project) => project.id === Number(projectId));
  return <div className={`ops-shell page-${location.pathname.slice(1)} ${className}`}>
    {menuOpen && <button className="ops-shell-scrim" aria-label="Đóng menu" onClick={() => setMenuOpen(false)} />}
    <aside className={`ops-shell-sidebar ${menuOpen ? "is-open" : ""}`} aria-label="Menu chính">
      <Link className="ops-shell-brand" to={scopedLink("/home", projectId)}><span className="ops-shell-mark">◈</span><span><strong>XÂY DỰNG SỐ</strong><small>Nền tảng điều hành thi công</small></span></Link>
      <nav>{visibleNavigation(current?.member_role,account.data?.user?.system_role).map(([label, path, icon]) => <NavLink key={path} aria-label={label} to={path==="/system-admin" ? path : scopedLink(path, projectId)} onClick={() => setMenuOpen(false)}><OperationsIcon name={icon} /><span>{label}</span>{path === "/notifications" && feed.data?.unread_count > 0 && <span className="ops-nav-count">{feed.data.unread_count}</span>}</NavLink>)}</nav>
      <SidebarLogout />
    </aside>
    <div className="ops-shell-body">
      <header className="ops-shell-topbar"><button className="ops-btn ops-menu-toggle" aria-label="Mở menu" onClick={() => setMenuOpen(true)}><OperationsIcon name="menu" /></button>
        <label className="ops-shell-project"><span>Dự án hiện tại</span><select aria-label="Chọn dự án" value={current ? String(current.id) : ""} disabled={projects.loading} onChange={(event) => navigate(scopedLink(location.pathname, event.target.value))}>
          <option value="" disabled>{projects.error ? "Không thể tải danh sách" : "Chọn dự án"}</option>{projects.data?.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
        </select></label>
        <form className="ops-shell-search" role="search" onSubmit={(event) => { event.preventDefault(); const next = new URLSearchParams(); if (validProjectId(projectId)) next.set("projectId", projectId); if (query.trim()) next.set("q", query.trim()); navigate(`/projects?${next}`); }}>
          <OperationsIcon name="search" size={18} /><input aria-label="Tìm dự án trong hệ thống" placeholder="Tìm tên dự án, địa điểm…" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="submit" aria-label="Tìm dự án"><OperationsIcon name="arrow" size={16} /></button>
        </form>
        <div className="ops-shell-account"><NotificationLink key={projectId} projectId={projectId} state={feed} /><button className="ops-shell-help" aria-label="Trợ giúp" onClick={() => setHelpOpen(true)}><OperationsIcon name="help" /></button><div className="ops-shell-avatar" aria-hidden="true">{account.data?.user?.fullname?.slice(0, 1) || "•"}</div><div><strong>{account.data?.user?.fullname || "Tài khoản"}</strong><small>{[account.data?.user?.system_role==="super_admin" ? "Super Admin" : "Người dùng",roleLabels[current?.member_role]].filter(Boolean).join(" · ")}</small></div></div>
      </header>
      <main className="ops-content">
        <div className="ops-page-heading"><div className="ops-heading-with-icon"><span className="ops-heading-icon"><OperationsIcon name={pageIcon} size={26} /></span><div><h1>{title}</h1><p>{description}</p></div></div>{actions && <div className="ops-actions">{actions}</div>}</div>
        <PwaUpdate />{children}
      </main>
    </div>
    {helpOpen && <Modal title="Trợ giúp điều hành dự án" onClose={() => setHelpOpen(false)}><p className="ops-muted">Chọn dự án ở thanh trên cùng để xem đúng dữ liệu công trường. Các thao tác hiển thị theo vai trò của bạn trong dự án.</p><div className="ops-help-links"><Link to="/projects" onClick={() => setHelpOpen(false)}><OperationsIcon name="folder" />Chọn hoặc tạo dự án<OperationsIcon name="right" /></Link>{validProjectId(projectId) && <><Link to={scopedLink("/members", projectId)} onClick={() => setHelpOpen(false)}><OperationsIcon name="users" />Thành viên & phân quyền<OperationsIcon name="right" /></Link><Link to={scopedLink("/calendar", projectId)} onClick={() => setHelpOpen(false)}><OperationsIcon name="calendar" />Thiết lập lịch làm việc<OperationsIcon name="right" /></Link></>}</div><p className="ops-muted">Nếu cần thêm quyền truy cập, hãy liên hệ ban quản lý dự án.</p></Modal>}
  </div>;
}
