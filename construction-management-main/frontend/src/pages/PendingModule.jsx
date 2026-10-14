import { Link, useLocation, useSearchParams } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import { Empty, NoProject } from "../components/OperationsUI";
import { navigation, scopedLink, validProjectId } from "../services/navigation";

export default function PendingModule() {
  const location = useLocation();
  const [params] = useSearchParams();
  const projectId = params.get("projectId");
  const title = navigation.find(([, path]) => path === location.pathname)?.[0] || "Không tìm thấy trang";
  return <DashboardLayout title={title} description="Điều hành thi công công trình">{!validProjectId(projectId) ? <NoProject /> : <section className="ops-card"><Empty><h2>Phân hệ chưa được triển khai</h2><p>Hiện có thể quản lý dự án, cấu hình lịch làm việc và giao việc hiện trường. Phân hệ này chưa hỗ trợ nhập hay lưu dữ liệu.</p><Link className="ops-btn ops-primary" to={scopedLink("/field-assignments", projectId)}>Giao việc hiện trường</Link></Empty></section>}</DashboardLayout>;
}
