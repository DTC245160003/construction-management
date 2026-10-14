import RecordEditor from "./RecordEditor";
import { api,projectPath } from "../services/operationsApi";

export default function WorkflowAction({ projectId,module,record,action,onClose,onSaved }) {
  const names = { submit:"Trình duyệt",approve:"Duyệt phiếu",return:"Trả lại phiếu" };
  return <RecordEditor title={names[action]} initial={{ reason:"" }} fields={action === "return" ? [{ name:"reason",label:"Lý do trả lại",type:"textarea",maxLength:2000 }] : []} onClose={onClose} onSaved={onSaved} submitLabel={names[action]} submit={(values) => api(projectPath(projectId,`/${module}/${record.id}/transition`),{ method:"POST",body:{ action,reason:values.reason,revision:record.revision } })}>
    <p>{names[action]} “{record.period}”? {action === "approve" && "Phiếu được duyệt sẽ khóa chỉnh sửa."}</p>
  </RecordEditor>;
}
