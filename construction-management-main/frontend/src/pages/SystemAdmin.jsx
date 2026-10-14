import { useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import { Modal,Field,FormActions,Notice,RemoteState,Empty } from "../components/OperationsUI";
import useRemote from "../hooks/useRemote";
import { api,roleLabels } from "../services/operationsApi";
import "../styles/SystemAdmin.css";

const projectRoles=["admin","project_manager","engineer","worker","accountant","viewer"];
function MembershipEditor({ user,projects,onClose,onSaved }) {
  const [projectId,setProjectId]=useState(String(user.projects[0]?.id || projects[0]?.id || ""));
  const [role,setRole]=useState(user.projects[0]?.role || "engineer"),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const membership=user.projects.find(p => p.id===Number(projectId));
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError("");
    try { await api(`/admin/projects/${projectId}/members${membership ? `/${user.id}` : ""}`,{ method:membership ? "PATCH" : "POST",body:membership ? { role } : { email:user.email,role } }); onSaved("Đã cập nhật vai trò dự án. Quyền hệ thống được giữ nguyên."); }
    catch(e) { setError(e.message); setBusy(false); }
  }
  return <Modal title={`Vai trò dự án — ${user.fullname}`} busy={busy} onClose={onClose}><Notice tone="error">{error}</Notice><form onSubmit={submit}>
    <p>{user.email}</p><Field label="Dự án"><select aria-label="Dự án" required value={projectId} onChange={e => { setProjectId(e.target.value); setRole(user.projects.find(p => p.id===Number(e.target.value))?.role || "engineer"); }}><option value="">Chọn dự án</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
    <Field label="Vai trò trong dự án"><select aria-label="Vai trò trong dự án" value={role} onChange={e => setRole(e.target.value)}>{[...new Set([...projectRoles,role])].map(r => <option key={r} value={r}>{roleLabels[r] || r}</option>)}</select></Field>
    <FormActions busy={busy || !projectId} onClose={onClose} label="Lưu vai trò dự án" /></form></Modal>;
}
function ConfirmAction({ title,description,action,onClose,onSaved }) {
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  return <Modal title={title} busy={busy} onClose={onClose}><Notice tone="error">{error}</Notice><p>{description}</p><form onSubmit={async e => { e.preventDefault(); setBusy(true); try { await action(); onSaved("Đã cập nhật và ghi nhật ký quyền."); } catch(e) { setError(e.message); setBusy(false); } }}><FormActions busy={busy} onClose={onClose} label="Xác nhận" /></form></Modal>;
}
export default function SystemAdmin() {
  const [search,setSearch]=useState(""),[query,setQuery]=useState(""),[revision,setRevision]=useState(0),[tab,setTab]=useState("users"),[modal,setModal]=useState(null),[message,setMessage]=useState("");
  const users=useRemote(`/admin/users?q=${encodeURIComponent(query)}`,revision),projects=useRemote("/projects",revision),audit=useRemote(tab==="audit" ? "/admin/audit-logs" : null,revision);
  const saved=text => { setMessage(text); setModal(null); setRevision(v => v+1); window.dispatchEvent(new Event("xds-permissions-changed")); };
  return <DashboardLayout title="Quản trị hệ thống" description="Quản lý tài khoản và vai trò theo từng dự án. Quyền Super Admin chỉ được cấp bằng CLI tại server." headingIcon="settings" refreshKey={revision} actions={<Link className="ops-btn ops-create" to="/projects">Tạo / quản lý dự án</Link>}>
    <Notice tone="success">{message}</Notice><div className="ops-tabs"><button className="ops-btn" aria-pressed={tab==="users"} onClick={() => setTab("users")}>Tài khoản</button><button className="ops-btn" aria-pressed={tab==="audit"} onClick={() => setTab("audit")}>Nhật ký thay đổi quyền</button></div>
    {tab==="users" ? <section className="ops-card system-admin-users"><form className="ops-toolbar" onSubmit={e => { e.preventDefault(); setQuery(search.trim()); }}><label>Tìm tên / email<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tên hoặc email người dùng" /></label><button className="ops-btn" type="submit">Tìm kiếm</button><button className="ops-btn" type="button" onClick={() => setRevision(v => v+1)}>Tải lại</button></form>
      <RemoteState state={users}>{users.data && (users.data.users.length ? <div className="ops-table-scroll"><table className="ops-table"><thead><tr><th>Tài khoản</th><th>Trạng thái</th><th>Quyền hệ thống</th><th>Dự án và vai trò</th><th>Thao tác</th></tr></thead><tbody>{users.data.users.map(u => <tr key={u.id}><td><strong>{u.fullname}</strong><small>{u.email}</small></td><td>{{ active:"Hoạt động",disabled:"Đã khóa",temporarily_locked:"Tạm khóa đăng nhập" }[u.status]}</td><td>{u.system_role==="super_admin" ? "Super Admin" : "Người dùng"}</td><td>{u.projects.length ? u.projects.map(p => <div className="system-membership" key={p.id}><Link to={`/members?projectId=${p.id}`}>{p.name}</Link><small>{roleLabels[p.role] || p.role}</small><button className="ops-btn ops-small" onClick={() => setModal({ kind:"remove",user:u,project:p })}>Gỡ khỏi {p.name}</button></div>) : "Chưa tham gia dự án"}</td><td><div className="ops-row-actions"><button className="ops-btn" disabled={!projects.data} onClick={() => setModal({ kind:"membership",user:u })}>Vai trò dự án</button><button className="ops-btn" onClick={() => setModal({ kind:"status",user:u })}>{u.is_active ? "Khóa tài khoản" : "Mở tài khoản"}</button></div></td></tr>)}</tbody></table></div> : <Empty>Không có tài khoản phù hợp.</Empty>)}</RemoteState></section>
      : <section className="ops-card"><RemoteState state={audit}>{audit.data && (audit.data.entries.length ? <div className="ops-table-scroll"><table className="ops-table"><thead><tr><th>Thời điểm</th><th>Người / công cụ</th><th>Dự án</th><th>Hành động</th><th>Chi tiết</th></tr></thead><tbody>{audit.data.entries.map(e => <tr key={e.id}><td>{new Date(e.created_at).toLocaleString("vi-VN")}</td><td>{e.actor_name || "CLI server"}</td><td>{e.project_name || "Toàn hệ thống"}</td><td>{e.action}</td><td><details><summary>Đối tượng {e.object_id}</summary><pre>{JSON.stringify({ before:e.before_value,after:e.after_value },null,2)}</pre></details></td></tr>)}</tbody></table></div> : <Empty>Chưa có thay đổi quyền.</Empty>)}</RemoteState></section>}
    {modal?.kind==="membership" && <MembershipEditor user={modal.user} projects={projects.data?.projects || []} onClose={() => setModal(null)} onSaved={saved} />}
    {modal?.kind==="status" && <ConfirmAction title={modal.user.is_active ? "Khóa tài khoản" : "Mở tài khoản"} description={`${modal.user.email}: ${modal.user.is_active ? "ngừng truy cập hệ thống; lịch sử và dữ liệu được giữ" : "cho phép đăng nhập lại"}.`} onClose={() => setModal(null)} onSaved={saved} action={() => api(`/admin/users/${modal.user.id}`,{ method:"PATCH",body:{ is_active:!modal.user.is_active } })} />}
    {modal?.kind==="remove" && <ConfirmAction title="Gỡ thành viên khỏi dự án" description={`${modal.user.email} sẽ mất quyền dự án ${modal.project.name}; tài khoản và audit được giữ.`} onClose={() => setModal(null)} onSaved={saved} action={() => api(`/admin/projects/${modal.project.id}/members/${modal.user.id}`,{ method:"DELETE" })} />}
  </DashboardLayout>;
}
