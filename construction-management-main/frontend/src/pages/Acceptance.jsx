import { useState } from "react";
import { Link,useSearchParams } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import { ContractProgress } from "../components/ModuleInsights";
import { WorkflowStrip } from "../components/OperationsVisuals";
import RecordEditor from "../components/RecordEditor";
import AttachmentPicker from "../components/AttachmentPicker";
import WorkflowAction from "../components/WorkflowAction";
import { Empty,Modal,NoProject,Notice,RemoteState } from "../components/OperationsUI";
import useRemote from "../hooks/useRemote";
import { api,dateLabel,numberLabel,projectPath,today } from "../services/operationsApi";
import { moneyLabel,photoUrl,workflowLabels,workflowTones } from "../services/siteApi";
import { scopedLink,validProjectId } from "../services/navigation";
import "../styles/SiteModules.css";

function AcceptanceForm({ projectId,record,data,onClose,onSaved }) {
  const initial = record || { work_item_id:"",period:"",day:today(),cumulative:"",notes:"",photo_ids:[] };
  return <RecordEditor title={record ? "Chỉnh sửa phiếu nghiệm thu" : "Lập phiếu nghiệm thu"} initial={initial} fields={[
    { name:"work_item_id",label:"Hạng mục",type:"select",options:data.contracts.filter((contract) => !record || contract.work_item_id === record.work_item_id).map((contract) => ({ value:contract.work_item_id,label:contract.item_name })) },
    { name:"period",label:"Kỳ / đợt nghiệm thu" },{ name:"day",label:"Ngày nghiệm thu",type:"date" },
    { name:"cumulative",label:"Lũy kế hiện tại",type:"number",min:"0.0001",step:"0.0001" },{ name:"notes",label:"Ghi chú",type:"textarea",required:false },
  ]} onClose={onClose} onSaved={onSaved} submit={(values) => api(projectPath(projectId,`/acceptance${record ? `/${record.id}` : ""}`),{ method:record ? "PUT" : "POST",body:{ ...values,work_item_id:Number(values.work_item_id) } })}>
    {(values,change) => { const contract = data.contracts.find((entry) => entry.work_item_id === Number(values.work_item_id)); return <>
      {contract && <Notice>Hợp đồng: <strong>{numberLabel(contract.quantity)} {contract.unit}</strong><br />Lũy kế đã duyệt: {numberLabel(contract.approved_quantity)} {contract.unit}<br />Khối lượng đợt này: {values.cumulative ? numberLabel(Number(values.cumulative)-Number(contract.approved_quantity)) : "—"} {contract.unit}<br />Đội đã báo: {numberLabel(contract.reported_quantity)} {contract.unit}</Notice>}
      <AttachmentPicker key={values.work_item_id || "none"} projectId={projectId} itemId={values.work_item_id} selected={values.photo_ids} onChange={(ids) => change("photo_ids",ids)} />
    </>; }}
  </RecordEditor>;
}
function ProjectAcceptance({ projectId }) {
  const state = useRemote(projectPath(projectId,"/acceptance"));
  const [status,setStatus] = useState("");
  const [search,setSearch] = useState("");
  const [tab,setTab] = useState("forms");
  const [modal,setModal] = useState(null);
  const [message,setMessage] = useState("");
  const data = state.data;
  const forms = (data?.forms || []).filter((form) => (!status || form.status === status) && `${form.period} ${form.item_name}`.toLocaleLowerCase("vi-VN").includes(search.toLocaleLowerCase("vi-VN")));
  const canContract = ["admin","project_manager","manager"].includes(data?.member_role);
  function saved() { setModal(null); setMessage("Đã lưu hồ sơ nghiệm thu."); state.reload(); }
  return <><Notice tone="success">{message}</Notice><RemoteState state={state}>{data && <>
    <WorkflowStrip records={data.forms} />
    <div className="acceptance-layout"><section className="ops-card"><div className="ops-tabs" role="tablist" aria-label="Nghiệm thu"><button role="tab" aria-selected={tab === "forms"} onClick={() => setTab("forms")}>Phiếu nghiệm thu</button><button role="tab" aria-selected={tab === "contracts"} onClick={() => setTab("contracts")}>Khối lượng hợp đồng</button></div>
      {tab === "forms" ? <><div className="ops-card-head"><div><h2>Hồ sơ nghiệm thu</h2><p>Lũy kế chỉ tăng khi phiếu được duyệt.</p></div>{data.can_edit && <button className="ops-btn ops-create" onClick={() => setModal({ kind:"form" })}>＋ Lập phiếu nghiệm thu</button>}</div><div className="ops-toolbar"><label className="ops-search">Tìm kiếm<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Kỳ nghiệm thu, hạng mục…" /></label><label>Trạng thái<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Tất cả</option>{Object.entries(workflowLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label><button className="ops-btn" onClick={state.reload}>Tải lại</button></div>
        {forms.length ? <div className="ops-table-scroll"><table className="ops-table"><thead><tr><th>Kỳ / hạng mục</th><th>Ngày</th><th>Đợt này</th><th>Lũy kế</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{forms.map((form) => <tr key={form.id}><td>{form.period}<small>{form.item_name} · {form.author}</small></td><td>{dateLabel(form.day)}</td><td>{numberLabel(form.quantity)} {form.unit}</td><td>{numberLabel(form.cumulative)} {form.unit}</td><td><span className={`ops-badge ops-badge-${workflowTones[form.status]}`}>{workflowLabels[form.status]}</span></td><td><div className="ops-row-actions"><button className="ops-btn ops-small" onClick={() => setModal({ kind:"detail",record:form })}>Chi tiết</button>{data.can_edit && ["draft","returned"].includes(form.status) && <button className="ops-btn ops-small" onClick={() => setModal({ kind:"form",record:form })}>Sửa</button>}{data.can_edit && form.status === "draft" && <button className="ops-btn ops-small" onClick={() => setModal({ kind:"workflow",record:form,action:"submit" })}>Trình duyệt</button>}{data.can_approve && form.status === "submitted" && <><button className="ops-btn ops-small ops-primary" onClick={() => setModal({ kind:"workflow",record:form,action:"approve" })}>Duyệt</button><button className="ops-btn ops-small ops-danger" onClick={() => setModal({ kind:"workflow",record:form,action:"return" })}>Trả lại</button></>}</div></td></tr>)}</tbody></table></div> : <Empty>Chưa có phiếu nghiệm thu phù hợp. Khai báo khối lượng hợp đồng trước khi lập phiếu.</Empty>}</>
        : <><div className="ops-card-head"><div><h2>Hợp đồng theo hạng mục lá</h2><p>Khối lượng và đơn giá là cơ sở nghiệm thu, thanh toán.</p></div></div>{data.items.filter((item) => item.is_leaf).length ? <div className="ops-table-scroll"><table className="ops-table"><thead><tr><th>Hạng mục</th><th>Hợp đồng</th><th>Đã duyệt</th><th>Đơn giá</th>{canContract && <th>Thao tác</th>}</tr></thead><tbody>{data.items.filter((item) => item.is_leaf).map((item) => { const contract = data.contracts.find((entry) => entry.work_item_id === item.id); return <tr key={item.id}><td>{item.title}</td><td>{contract ? `${numberLabel(contract.quantity)} ${contract.unit}` : "Chưa khai báo"}</td><td>{contract ? `${numberLabel(contract.approved_quantity)} ${contract.unit}` : "—"}</td><td>{contract ? `${moneyLabel(contract.unit_price)} ₫` : "—"}</td>{canContract && <td><button className="ops-btn ops-small" onClick={() => setModal({ kind:"contract",item,record:contract })}>{contract ? "Cập nhật" : "Khai báo"}</button></td>}</tr>; })}</tbody></table></div> : <Empty><p>Chưa có hạng mục lá.</p><Link className="ops-btn" to={scopedLink("/work-items",projectId)}>Mở cây hạng mục</Link></Empty>}</>}
    </section><ContractProgress contracts={data.contracts}/></div>
  </>}</RemoteState>
    {modal?.kind === "form" && <AcceptanceForm projectId={projectId} record={modal.record} data={data} onClose={() => setModal(null)} onSaved={saved} />}
    {modal?.kind === "contract" && <RecordEditor title={`Hợp đồng · ${modal.item.title}`} initial={modal.record || { quantity:"",unit:"",unit_price:"",revision:0 }} fields={[{ name:"quantity",label:"Khối lượng hợp đồng",type:"number",min:"0.0001",step:"0.0001" },{ name:"unit",label:"Đơn vị",maxLength:30 },{ name:"unit_price",label:"Đơn giá (₫)",type:"number",min:0,step:"0.01" }]} submit={(values) => api(projectPath(projectId,`/contracts/${modal.item.id}`),{ method:"PUT",body:values })} onClose={() => setModal(null)} onSaved={saved} />}
    {modal?.kind === "workflow" && <WorkflowAction {...modal} module="acceptance" projectId={projectId} onClose={() => setModal(null)} onSaved={saved} />}
    {modal?.kind === "detail" && <Modal variant="drawer" title={`Phiếu #${modal.record.id} · ${modal.record.period}`} onClose={() => setModal(null)}><dl className="ops-details-list"><dt>Hạng mục</dt><dd>{modal.record.item_name}</dd><dt>Khối lượng đợt</dt><dd>{numberLabel(modal.record.quantity)} {modal.record.unit}</dd><dt>Lũy kế trước</dt><dd>{numberLabel(modal.record.previous_cumulative)}</dd><dt>Lũy kế hiện tại</dt><dd>{numberLabel(modal.record.cumulative)}</dd><dt>Người lập</dt><dd>{modal.record.author}</dd><dt>Người duyệt</dt><dd>{modal.record.approver || "Chưa duyệt"}</dd></dl><Notice tone="warning">{modal.record.return_reason}</Notice><p className="ops-note">{modal.record.notes}</p><div className="ops-photo-picker">{modal.record.photo_ids.map((id) => <a key={id} href={photoUrl(projectId,id,true)} target="_blank" rel="noreferrer"><img src={photoUrl(projectId,id)} alt={`Ảnh nghiệm thu ${id}`} /></a>)}</div></Modal>}
  </>;
}
export default function Acceptance() {
  const [params] = useSearchParams(); const projectId = params.get("projectId");
  return <DashboardLayout title="Nghiệm thu khối lượng" description="Đối chiếu khối lượng hợp đồng, lập hồ sơ và theo dõi quá trình phê duyệt.">{validProjectId(projectId) ? <ProjectAcceptance key={projectId} projectId={projectId} /> : <NoProject />}</DashboardLayout>;
}
