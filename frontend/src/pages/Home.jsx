import { Link,useSearchParams } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import { Empty,RemoteState } from "../components/OperationsUI";
import Icon from "../components/OperationsIcon";
import useRemote from "../hooks/useRemote";
import { dateLabel,roleLabels,projectStatuses } from "../services/operationsApi";
import { validProjectId,visibleNavigation,scopedLink } from "../services/navigation";

function ProjectOverview({ projectId }) {
  const state=useRemote(`/projects/${projectId}/overview`),project=state.data?.project;
  return <RemoteState state={state}>{project && <>
    <section className="ops-card"><h2>{project.name}</h2><p>{project.location}</p><div className="ops-grid-two"><p>Ngày khởi công: <strong>{dateLabel(project.start_date)}</strong></p><p>Trạng thái: <strong>{projectStatuses[project.status] || project.status}</strong></p></div><p>Vai trò của bạn trong dự án: <strong>{roleLabels[project.member_role] || project.member_role}</strong></p></section>
    <section className="ops-card"><h2>Chức năng được cấp trong dự án</h2><div className="ops-help-links">{visibleNavigation(project.member_role,"user").filter(([,path]) => !["/home","/projects"].includes(path)).map(([label,path,icon]) => <Link key={path} to={scopedLink(path,projectId)}><Icon name={icon} />{label}<Icon name="right" /></Link>)}</div></section>
  </>}</RemoteState>;
}
export default function Home() {
  const [params]=useSearchParams(),projectId=params.get("projectId");
  return <DashboardLayout className="xds-dashboard" title="Tổng quan" description="Chọn dự án để xem thông tin và các chức năng theo quyền hiện tại.">
    {validProjectId(projectId) ? <ProjectOverview key={projectId} projectId={projectId} /> : <section className="ops-card"><Empty><h2>Chọn dự án để bắt đầu</h2><p>Tài khoản mới chưa có quyền dự án. Liên hệ Ban quản lý hoặc Super Admin để được phân công.</p><Link className="ops-btn ops-create" to="/projects">Mở danh sách dự án</Link></Empty></section>}
  </DashboardLayout>;
}
