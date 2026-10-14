import { useState } from "react";
import useRemote from "../hooks/useRemote";
import { projectPath } from "../services/operationsApi";
import { photoUrl,uploadPhoto } from "../services/siteApi";
import { Notice,RemoteState } from "./OperationsUI";

export default function AttachmentPicker({ projectId,itemId,selected,onChange }) {
  const state = useRemote(projectPath(projectId,"/photos"));
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  async function upload(event) {
    const files = Array.from(event.target.files); event.target.value = "";
    if (!itemId) { setError("Chọn hạng mục trước khi tải ảnh."); return; }
    setBusy(true); setError(""); const ids = [...selected];
    try { for (const file of files) { const photo = await uploadPhoto(projectId,itemId,file); ids.push(photo.id); } }
    catch (failure) { setError(failure.message); }
    finally { onChange([...new Set(ids)]); setBusy(false); state.reload(); }
  }
  return <div className="ops-attachments"><div className="ops-card-head"><strong>Ảnh đính kèm ({selected.length})</strong><label className="ops-btn ops-small">{busy ? "Đang tải…" : "＋ Tải ảnh"}<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || !itemId} onChange={upload} hidden /></label></div><Notice tone="error">{error}</Notice>
    <RemoteState state={state}><div className="ops-photo-picker">{state.data?.photos.filter((photo) => photo.work_item_id === Number(itemId)).map((photo) => <label key={photo.id}><input type="checkbox" checked={selected.includes(photo.id)} onChange={(event) => onChange(event.target.checked ? [...selected,photo.id] : selected.filter((id) => id!==photo.id))} /><img src={photoUrl(projectId,photo.id)} alt={photo.filename} loading="lazy" /></label>)}</div></RemoteState>
    <small className="ops-muted">Chọn ảnh của hạng mục đang lập phiếu. JPEG, PNG hoặc WebP, tối đa 10 MB/ảnh.</small>
  </div>;
}
