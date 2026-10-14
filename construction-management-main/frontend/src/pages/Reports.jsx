import { useState } from "react";
import { Link,useSearchParams } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import { ReportOverview } from "../components/ModuleInsights";
import { SectionHeading } from "../components/OperationsVisuals";
import RecordEditor from "../components/RecordEditor";
import { Empty,NoProject,Notice,RemoteState } from "../components/OperationsUI";
import useRemote from "../hooks/useRemote";
import { api,dateLabel,projectPath,today } from "../services/operationsApi";
import { moneyLabel,totalMoney } from "../services/siteApi";
import { scopedLink,validProjectId } from "../services/navigation";
import "../styles/SiteModules.css";

function ProjectReports({ projectId }) {
  const state = useRemote(projectPath(projectId,"/reports")); const data = state.data;
  const [modal,setModal] = useState(false); const [itemId,setItemId] = useState(""); const [busy,setBusy] = useState(false); const [error,setError] = useState("");
  async function download() {
    if (!itemId) { setError("Chọn hạng mục để xuất hồ sơ."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(projectPath(projectId,`/reports/acceptance.pdf?workItemId=${itemId}`),{ credentials:"include" });
      if (!response.ok) { const data = await response.json().catch(() => null); throw new Error(data?.message || "Không thể xuất PDF."); }
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = `ho-so-nghiem-thu-${projectId}-${itemId}.pdf`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  const late = data?.tasks.filter((task) => task.isCritical && task.is_late) || [];
  const approved = data?.payments.filter((payment) => payment.status === "approved") || [];
  return <><Notice tone="error">{error}</Notice><RemoteState state={state}>{data && <>
    <ReportOverview data={data} />
    <div className="ops-grid-two"><section className="ops-card"><SectionHeading icon="calendar" title="Dự báo hoàn thành" description="So sánh kế hoạch và thời điểm dự kiến hiện tại"/><dl className="ops-details-list"><dt>Kết thúc kế hoạch</dt><dd>{dateLabel(data.planned_finish)}</dd><dt>Dự kiến hiện tại</dt><dd>{data.forecast_finish ? dateLabel(data.forecast_finish) : "Chưa đủ dữ liệu để dự báo"}</dd><dt>Chênh lệch</dt><dd>{data.forecast_finish && data.planned_finish ? `${Math.round((new Date(data.forecast_finish)-new Date(data.planned_finish))/86400000)} ngày` : "Chưa xác định"}</dd><dt>Công việc hoàn thành</dt><dd>{data.tasks.filter((task) => task.complete).length} / {data.tasks.length}</dd></dl>{data.progress != null && <progress className="ops-report-progress" value={data.progress} max="100" aria-label="Tiến độ thi công" />}<Link className="ops-btn" to={scopedLink("/schedule",projectId)}>Xem tiến độ & đường găng</Link></section>
      <section className="ops-card"><SectionHeading icon="money" tone="green" title="Thanh toán đã duyệt" description="Giá trị theo hồ sơ đã phê duyệt"/><dl className="ops-details-list"><dt>Tổng thành tiền</dt><dd>{moneyLabel(totalMoney(approved,"gross"))} ₫</dd><dt>Tạm giữ lũy kế</dt><dd>{moneyLabel(totalMoney(approved,"retained"))} ₫</dd><dt>Giá trị thực trả</dt><dd>{moneyLabel(totalMoney(approved,"net"))} ₫</dd></dl><Link className="ops-btn" to={scopedLink("/payments",projectId)}>Chi tiết thanh toán</Link></section></div>
    <section className="ops-card"><div className="ops-card-head"><div><h2>Mốc kiểm soát tiến độ</h2><p>Cảnh báo khi quá hạn mà công việc liên quan chưa hoàn thành.</p></div>{data.can_manage && <button className="ops-btn ops-create" onClick={() => setModal(true)}>＋ Thêm mốc</button>}</div>{data.milestones.length ? <div className="ops-table-scroll"><table className="ops-table"><thead><tr><th>Mốc</th><th>Công việc</th><th>Hạn hoàn thành</th><th>Trạng thái</th></tr></thead><tbody>{data.milestones.map((milestone) => <tr key={milestone.id}><td>{milestone.title}</td><td>{data.tasks.find((task) => task.id === milestone.task_id)?.name}</td><td>{dateLabel(milestone.due_date)}</td><td><span className={`ops-badge ops-badge-${milestone.complete ? "green" : milestone.overdue ? "red" : "gray"}`}>{milestone.complete ? "Hoàn thành" : milestone.overdue ? "Quá hạn" : "Đang theo dõi"}</span></td></tr>)}</tbody></table></div> : <Empty>Chưa cấu hình mốc kiểm soát.</Empty>}</section>
    <section className="ops-card"><SectionHeading icon="warning" tone="orange" title="Công việc găng đang chậm" description="Ưu tiên kiểm tra các công việc ảnh hưởng tiến độ"/>{late.length ? <div className="ops-table-scroll"><table className="ops-table"><thead><tr><th>Công việc</th><th>Hạng mục</th><th>Hạn kế hoạch</th><th>Đội thi công</th></tr></thead><tbody>{late.map((task) => <tr key={task.id}><td><Link to={`${scopedLink("/field-assignments",projectId)}&taskId=${task.id}`}>{task.name}</Link></td><td>{task.work_item_name}</td><td>{dateLabel(task.finish_date)}</td><td>{task.team_name || "Chưa phân công"}</td></tr>)}</tbody></table></div> : <Empty>Không có công việc găng trễ theo dữ liệu hiện tại.</Empty>}</section>
    <section className="ops-card"><div className="ops-card-head"><div><h2>Xuất hồ sơ nghiệm thu PDF</h2><p>Gồm thông tin dự án, các phiếu đã duyệt, khối lượng, ảnh, thời điểm và người phê duyệt.</p></div></div><div className="ops-toolbar"><label className="ops-search">Hạng mục<select value={itemId} onChange={(event) => setItemId(event.target.value)}><option value="">Chọn hạng mục</option>{data.items.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><button className="ops-btn ops-primary" disabled={busy} onClick={download}>{busy ? "Đang xuất…" : "Tải hồ sơ PDF"}</button></div></section>
  </>}</RemoteState>{modal && <RecordEditor title="Thêm mốc kiểm soát" initial={{ title:"",task_id:"",due_date:today() }} fields={[{ name:"title",label:"Tên mốc" },{ name:"task_id",label:"Công việc liên quan",type:"select",options:data.tasks.map((task) => ({ value:task.id,label:task.name })) },{ name:"due_date",label:"Hạn hoàn thành",type:"date" }]} submit={(values) => api(projectPath(projectId,"/milestones"),{ method:"POST",body:{ ...values,task_id:Number(values.task_id) } })} onClose={() => setModal(false)} onSaved={() => { setModal(false); state.reload(); }} />}</>;
}
export default function Reports() { const [params] = useSearchParams(); const projectId = params.get("projectId"); return <DashboardLayout title="Báo cáo" description="Tổng hợp tiến độ, nghiệm thu, thanh toán và cảnh báo từ dữ liệu công trường.">{validProjectId(projectId) ? <ProjectReports key={projectId} projectId={projectId} /> : <NoProject />}</DashboardLayout>; }
