import { useEffect,useRef,useState } from "react";
import { useNavigate,useSearchParams } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import { JournalOverview } from "../components/ModuleInsights";
import RecordEditor from "../components/RecordEditor";
import { Empty,Field,FormActions,Modal,NoProject,Notice,RemoteState } from "../components/OperationsUI";
import useRemote from "../hooks/useRemote";
import { api,dateLabel,projectPath,today } from "../services/operationsApi";
import { photoUrl } from "../services/siteApi";
import { loadJournals,queueSnapshot,queueStatus,removePending,savePending,syncJournals,retrySync,storageStatus,requestPersistentStorage,registerBackgroundSync } from "../services/journalOffline";
import { prepareLocalPhoto } from "../services/photoCompression";
import { validProjectId } from "../services/navigation";
import "../styles/SiteModules.css";
import "../styles/JournalSync.css";

function LocalPhoto({ file }) {
  const [url,setUrl]=useState("");
  useEffect(() => { const next=URL.createObjectURL(file); Promise.resolve().then(() => setUrl(next)); return () => URL.revokeObjectURL(next); },[file]);
  return <img src={url || undefined} loading="lazy" decoding="async" alt={file.name || "Ảnh lưu trên thiết bị"} />;
}
function ArchivedPhoto({ photo }) {
  const [url,setUrl]=useState("");
  useEffect(() => { const next=URL.createObjectURL(photo.file); Promise.resolve().then(() => setUrl(next)); return () => URL.revokeObjectURL(next); },[photo.file]);
  return <a className="ops-btn" href={url || undefined} download={photo.filename || photo.file.name || "anh-nhat-ky.jpg"}>Tải bản gốc: {photo.filename || photo.file.name}</a>;
}
function journalLocked(entry) { return Boolean(entry?.is_locked || entry?.locked); }
function DailyFields({ values,setValues,catalog,disabled=false }) {
  const change=(e) => setValues({ ...values,[e.target.name]:e.target.value });
  return <fieldset className="journal-equipment" disabled={disabled}><div className="ops-grid-two"><Field label="Nhân lực trong ngày"><input name="manpower" type="number" value={values.manpower ?? 0} onChange={change} min={0} max={1000000} step={1} required /></Field><Field label="Thời tiết"><select name="weather_code" value={values.weather_code || ""} onChange={(e) => setValues({ ...values,weather_code:e.target.value,weather:catalog.find((c) => c.code===e.target.value && c.kind==="weather")?.label || "" })} required><option value="">Chọn thời tiết</option>{catalog.filter((c) => c.kind==="weather" && c.active).map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select></Field></div><fieldset className="journal-equipment"><legend>Thiết bị trong ngày</legend>{catalog.filter((c) => c.kind==="equipment" && c.active).map((c) => <label key={c.code}><input type="checkbox" checked={(values.equipment_codes || []).includes(c.code)} onChange={(e) => { const codes=e.target.checked ? [...(values.equipment_codes || []),c.code] : (values.equipment_codes || []).filter((v) => v!==c.code); setValues({ ...values,equipment_codes:codes,equipment:codes.map((code) => catalog.find((x) => x.kind==="equipment" && x.code===code)?.label).join(", ") }); }} />{c.label}</label>)}</fieldset></fieldset>;
}
function JournalForm({ projectId,user,data,record,pending,onClose,onSaved }) {
  const day=record?.day || pending?.body.day || today(),info=data.journals.find((j) => j.day===day),catalog=data.catalog || [];
  const initial=pending?.body || record || {};
  const [values,setValues]=useState({ work_item_id:"",day,time:new Date().toTimeString().slice(0,5),content:"",manpower:info?.manpower ?? 0,equipment:info?.equipment || "",equipment_codes:info?.equipment_codes || [],weather:info?.weather || "",weather_code:info?.weather_code || "",daily_revision:info?.daily_revision || 0,photo_ids:[],client_uuid:crypto.randomUUID(),...initial });
  const [photos,setPhotos]=useState(pending?.photos || []),[busy,setBusy]=useState(false),[preparing,setPreparing]=useState(false),[error,setError]=useState("");
  const dayState=useRemote(values.day ? projectPath(projectId,`/journals/daily?day=${values.day}`) : null);
  const original=data.journals.find((j) => j.id===(record?.id || pending?.body.id)) || record;
  const originalLocked=journalLocked(original);
  const isLocked=originalLocked || data.journals.some((j) => j.day===values.day && j.day_locked) || journalLocked(dayState.data?.lock);
  const dailyLocked=isLocked || journalLocked(dayState.data?.daily);
  useEffect(() => { globalThis.xdsJournalEditing=true; return () => { globalThis.xdsJournalEditing=false; }; },[]);
  const change=(e) => setValues({ ...values,[e.target.name]:e.target.value });
  async function changeDay(e) {
    const next=e.target.value,cached=data.journals.find((j) => j.day===next);
    setValues((v) => ({ ...v,day:next,manpower:cached?.manpower ?? 0,equipment:cached?.equipment || "",equipment_codes:cached?.equipment_codes || [],weather:cached?.weather || "",weather_code:cached?.weather_code || "",daily_revision:cached?.daily_revision || 0 }));
    if (!next) return;
    try {
      const result=await api(projectPath(projectId,`/journals/daily?day=${next}`));
      if (result.daily) setValues((v) => v.day===next ? { ...v,manpower:result.daily.manpower,equipment:result.daily.equipment,equipment_codes:result.daily.equipment_codes || [],weather:result.daily.weather,weather_code:result.daily.weather_code || "",daily_revision:result.daily.revision } : v);
    } catch { /* Use saved daily information offline; the server rechecks locks and revisions during sync. */ }
  }
  async function addPhotos(event) {
    const files=Array.from(event.target.files); event.target.value="";
    if (isLocked || preparing) return;
    if (photos.length+files.length+values.photo_ids.length>20) { setError("Tối đa 20 ảnh cho mỗi nhật ký."); return; }
    setPreparing(true); setError("");
    try { const prepared=[]; for (const file of files) prepared.push(await prepareLocalPhoto(file)); setPhotos((p) => [...p,...prepared]); } catch(e) { setError(e.message); } finally { setPreparing(false); }
  }
  async function save(event) {
    event.preventDefault();
    if (isLocked) { setError("Nhật ký ngày đã bị khóa sổ, không thể chỉnh sửa hoặc xóa."); return; }
    if (preparing || busy) return;
    setBusy(true); setError("");
    try {
      const uuid=values.client_uuid || crypto.randomUUID();
      await savePending({ key:pending?.key || `${user.id}:${projectId}:${uuid}`,projectId:Number(projectId),userId:user.id,createdAt:pending?.createdAt || Date.now(),photos,
        body:{ ...values,id:record?.id || values.id || null,operation_uuid:crypto.randomUUID(),client_uuid:uuid,work_item_id:Number(values.work_item_id),manpower:Number(values.manpower),time:values.time.slice(0,5),photo_ids:values.photo_ids || [] } });
      onSaved();
    } catch(e) { setError(e.message); setBusy(false); }
  }
  return <Modal variant="drawer" title={<span>{record || pending ? "Chi tiết / Chỉnh sửa nhật ký" : "Ghi nhật ký công trường"}{isLocked && <span className="ops-badge ops-badge-gray" style={{ marginLeft:8 }}>Đã khóa sổ</span>}</span>} busy={busy || preparing} onClose={onClose}>
    <Notice tone="error">{isLocked ? "Nhật ký ngày đã bị khóa sổ, không thể chỉnh sửa hoặc xóa." : error}</Notice><form onSubmit={save}>
    <Field label="Hạng mục"><select name="work_item_id" value={values.work_item_id} onChange={change} required disabled={isLocked}><option value="">Chọn hạng mục</option>{data.items.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</select></Field>
    <div className="ops-grid-two"><Field label="Ngày"><input type="date" name="day" value={values.day} onChange={changeDay} required disabled={originalLocked} /></Field><Field label="Giờ"><input type="time" name="time" value={values.time.slice(0,5)} onChange={change} required disabled={isLocked} /></Field></div>
    <Field label="Nội dung công việc"><textarea name="content" value={values.content} onChange={change} maxLength={20000} required disabled={isLocked} /></Field>
    <DailyFields values={values} setValues={setValues} catalog={catalog} disabled={dailyLocked} />
    {!isLocked && <><Field label="Chọn nhiều ảnh (tối đa 10 MB/ảnh)"><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={preparing} onChange={addPhotos} /></Field>
    <Field label="Chụp ảnh hiện trường"><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={preparing} onChange={addPhotos} /></Field></>}
    {preparing && <p role="status">Đang nén ảnh dưới 1 MB…</p>}
    <div className="ops-photo-picker">{photos.map((p) => <div key={p.clientUuid}><LocalPhoto file={p.display || p.file} /><small>{p.metadata?.displayBytes ? `${Math.ceil(p.metadata.displayBytes/1024)} KB · Chưa tải lên` : "Chưa tải lên"}</small>{!isLocked && <button className="ops-btn" type="button" onClick={() => setPhotos(photos.filter((x) => x.clientUuid!==p.clientUuid))}>Bỏ ảnh</button>}</div>)}{values.photo_ids.map((id) => <div key={id}><img src={photoUrl(projectId,id)} alt={`Ảnh ${id}`} />{!isLocked && <button className="ops-btn" type="button" onClick={() => setValues({ ...values,photo_ids:values.photo_ids.filter((x) => x!==id) })}>Bỏ ảnh</button>}</div>)}</div>
    <Notice>Bản ghi được lưu bền trên thiết bị. Nhật ký gửi trước, ảnh gửi sau; bản gốc và metadata được giữ nguyên. Nhật ký đã khóa sổ không thể chỉnh sửa.</Notice>
    {isLocked ? <div className="ops-form-actions"><button className="ops-btn" type="button" onClick={onClose}>Đóng</button></div> : <FormActions busy={busy || preparing} onClose={onClose} label="Lưu nhật ký" />}
  </form></Modal>;
}
function JournalHistory({ projectId,record,canWrite,local,onClose,onSaved }) {
  const state=useRemote(projectPath(projectId,`/journals/${record.id}/history`)),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const isLocked=journalLocked(state.data?.journal || record);
  const latest=state.data?.versions.find((v) => v.revision===state.data.journal.revision)?.snapshot;
  const resolvedLocal=local && state.data?.conflicts.find((c) => c.id===local.conflict?.id && c.resolved_at);
  async function applyResolved() {
    setBusy(true); setError("");
    try { await globalThis.XdsJournalQueue.resolveLocal(local.key,state.data.journal.id,resolvedLocal.chosen); onSaved(); }
    catch(e) { setError(e.message); setBusy(false); }
  }
  async function resolve(c,chosen) {
    if (isLocked) { setError("Nhật ký ngày đã bị khóa sổ, không thể xử lý phiên bản xung đột."); return; }
    setBusy(true); setError("");
    try {
      const result=await api(projectPath(projectId,`/journals/conflicts/${c.id}/resolve`),{ method:"POST",body:{ chosen,revision:state.data.journal.revision } });
      if (local) await globalThis.XdsJournalQueue.resolveLocal(local.key,result.journal.id,chosen);
      onSaved();
    } catch(e) { setError(e.message); setBusy(false); if (e.status===409) state.reload(); }
  }
  return <Modal variant="drawer" title="Chi tiết và lịch sử nhật ký" busy={busy} onClose={onClose}><Notice tone="error">{error}</Notice><RemoteState state={state}>{state.data && <><p>{state.data.journal.content}</p><p>Phiên bản hiện tại: {state.data.journal.revision}</p>{resolvedLocal && <Notice>Xung đột này đã được xử lý trên máy chủ. <button className="ops-btn" disabled={busy} onClick={applyResolved}>Áp dụng lựa chọn đã xử lý</button></Notice>}{state.data.conflicts.filter((c) => !c.resolved_at).map((c) => <section className="journal-conflict" key={c.id}><h3>Xung đột từ phiên bản {c.base_revision}</h3><div className="journal-compare">{[["server","Bản trên máy chủ",latest || c.server_snapshot],["incoming","Bản gửi đến",c.incoming_snapshot]].map(([key,label,s]) => <article key={key}><h4>{label}</h4><dl><dt>Hạng mục</dt><dd>{s.work_item_id}</dd><dt>Ngày / giờ</dt><dd>{s.day} · {s.time}</dd><dt>Nội dung</dt><dd>{s.content}</dd></dl>{canWrite && !isLocked && <button className="ops-btn" disabled={busy} onClick={() => resolve(c,key)}>Giữ {key==="server" ? "bản máy chủ" : "bản gửi đến"}</button>}</article>)}</div></section>)}<h3>Lịch sử phiên bản</h3>{state.data.versions.map((v) => <details key={v.revision}><summary>Phiên bản {v.revision} · {new Date(v.created_at).toLocaleString("vi-VN")}</summary><p>{v.snapshot.day} · {v.snapshot.time}</p><p>{v.snapshot.content}</p></details>)}{state.data.conflicts.filter((c) => c.resolved_at).map((c) => <details key={c.id}><summary>Xung đột đã xử lý · giữ {c.chosen}</summary><p>Bản máy chủ: {c.server_snapshot.content}</p><p>Bản gửi đến: {c.incoming_snapshot.content}</p></details>)}</>}</RemoteState></Modal>;
}
function DailyPanel({ projectId,data,canWrite,day,onSaved }) {
  const state=useRemote(projectPath(projectId,`/journals/daily?day=${day}`)),[modal,setModal]=useState(false),[week,setWeek]=useState(day);
  const end=new Date(`${week}T00:00:00Z`); end.setUTCDate(end.getUTCDate()+6);
  const range=useRemote(week ? projectPath(projectId,`/journals/days?from=${week}&to=${end.toISOString().slice(0,10)}`) : null);
  const info=state.data?.daily;
  return <section className="ops-card journal-daily"><div className="ops-card-head"><h2>Thông tin đầu ngày · {dateLabel(day)}</h2>{canWrite && state.data && !journalLocked(state.data.lock) && !journalLocked(info) && <button className="ops-btn" onClick={() => setModal(true)}>Nhập thông tin đầu ngày</button>}</div><RemoteState state={state}><p>{info ? `${info.manpower} nhân lực · ${info.weather} · ${info.equipment || "Không có thiết bị"}${info.all_day_rain ? " · ☔ Mưa cả ngày" : ""}` : "Chưa nhập thông tin đầu ngày"}</p></RemoteState>
    <label>Tuần từ ngày<input type="date" value={week} onChange={(e) => { if (e.target.value) setWeek(e.target.value); }} /></label><RemoteState state={range}><div className="journal-week">{range.data?.days.map((d) => <article key={d.day}><strong>{dateLabel(d.day)} {d.all_day_rain && "☔"}</strong><p>{d.manpower} người · {d.weather}</p><small>{d.equipment}</small></article>)}</div>{range.data && <p>Công việc cần đối chiếu tiến độ: {range.data.tasks.filter((t) => t.delayed).map((t) => t.name).join(", ") || "Không có công việc chậm"}. Ngày mưa là dữ liệu đối chiếu, chưa xác định nguyên nhân chậm.</p>}</RemoteState>
    {modal && <DailyEditor projectId={projectId} day={day} info={info} catalog={data.catalog || []} onClose={() => setModal(false)} onSaved={() => { setModal(false); state.reload(); range.reload(); onSaved(); }} />}
  </section>;
}
function DailyEditor({ projectId,day,info,catalog,onClose,onSaved }) {
  const [values,setValues]=useState({ day,manpower:0,weather:"",weather_code:"",equipment:"",equipment_codes:[],revision:0,...info }),[busy,setBusy]=useState(false),[error,setError]=useState("");
  return <Modal title="Thông tin đầu ngày" busy={busy} onClose={onClose}><Notice tone="error">{error}</Notice><form onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await api(projectPath(projectId,"/journals/daily"),{ method:"PUT",body:{ ...values,manpower:Number(values.manpower) } }); onSaved(); } catch(f) { setError(f.message); setBusy(false); } }}><DailyFields values={values} setValues={setValues} catalog={catalog} /><FormActions busy={busy} onClose={onClose} label="Lưu thông tin đầu ngày" /></form></Modal>;
}
function ProjectJournal({ projectId }) {
  const [attempt,setAttempt]=useState(0),[state,setState]=useState({ loading:true,data:null,user:null,error:null,offline:false }),[queue,setQueue]=useState([]),[sync,setSync]=useState({ journals:0,photos:0,errors:[],state:"synced" }),[storage,setStorage]=useState(null),[background,setBackground]=useState(false),[modal,setModal]=useState(null),[message,setMessage]=useState(""),[filters,setFilters]=useState({ day:"",item:"",author:"",sync:"" });
  const running=useRef(false);
  useEffect(() => {
    const c=new AbortController(); loadJournals(projectId,c.signal).then((r) => { if (!c.signal.aborted) setState({ ...r,loading:false,error:null }); }).catch((error) => { if (!c.signal.aborted && error.name!=="AbortError") setState({ loading:false,data:null,user:null,error }); }); return () => c.abort();
  },[projectId,attempt]);
  useEffect(() => {
    const uid=state.user?.id; if (!uid) return; let alive=true;
    let refreshing=null,refreshAgain=false,previousCounts=null;
    const refresh=() => {
      if (refreshing) { refreshAgain=true; return refreshing; }
      refreshing=(async () => {
        do {
          refreshAgain=false;
          const [{pending,status},space]=await Promise.all([queueSnapshot(projectId,uid),storageStatus()]);
          if (alive) {
            setQueue(pending); setSync(status); setStorage(space);
            // A saved journal must become visible even while a later photo
            // upload is still running. Waiting for sync() to finish all photos
            // leaves the server record hidden behind the old cached list.
            const advanced=previousCounts && (status.journals<previousCounts.journals || status.photos<previousCounts.photos);
            previousCounts={journals:status.journals,photos:status.photos};
            if(advanced)reloadActive().catch(()=>{});
          }
        } while (alive && refreshAgain);
      })().finally(() => { refreshing=null; });
      return refreshing;
    };
    const reloadActive=async () => { const who=await globalThis.XdsJournalQueue.get("control","identity"); if (alive && navigator.onLine && who?.userId===uid) setAttempt((n) => n+1); };
    const run=async () => {
      await refresh(); const identity=await globalThis.XdsJournalQueue.get("control","identity"); if (running.current || !navigator.onLine || identity?.userId!==uid) return; running.current=true;
      try { const before=await queueStatus(projectId,uid); await syncJournals(projectId,uid); const after=await queueStatus(projectId,uid),current=await globalThis.XdsJournalQueue.get("control","identity"); if (alive && current?.generation===identity.generation && (before.journals>after.journals || before.photos>after.photos)) setAttempt((n) => n+1); }
      catch(e) { if (alive && navigator.onLine) setMessage(e.message); }
      finally { running.current=false; await refresh(); }
    };
    const changed=() => { refresh().catch(() => {}); if (!running.current) run().catch(() => {}); };
    const workerChanged=(e) => { if (e.data?.type==="XDS_QUEUE_CHANGED") { changed(); reloadActive().catch(() => {}); } };
    run(); registerBackgroundSync().then((v) => { if (alive) setBackground(v); });
    const online=() => {
      (async () => {
        const who=await globalThis.XdsJournalQueue.get("control","identity");
        if (!alive || who?.userId!==uid) return;
        setAttempt((n) => n+1); await run();
      })().catch(() => {});
    };
    const timer=setInterval(run,5000); window.addEventListener("online",online); window.addEventListener("offline",changed); window.addEventListener("xds-queue-changed",changed); navigator.serviceWorker?.addEventListener("message",workerChanged);
    return () => { alive=false; clearInterval(timer); window.removeEventListener("online",online); window.removeEventListener("offline",changed); window.removeEventListener("xds-queue-changed",changed); navigator.serviceWorker?.removeEventListener("message",workerChanged); };
  },[projectId,state.user?.id]);
  const reload=() => setAttempt((n) => n+1),saved=() => { setModal(null); setMessage("Đã lưu trên thiết bị. Hệ thống tự đồng bộ khi có mạng."); reload(); };
  const serverSaved=() => { setModal(null); setMessage("Đã lưu trên máy chủ."); reload(); };
  const data=state.data,canWrite=["admin","project_manager","manager","engineer"].includes(data?.member_role),canManage=["admin","project_manager","manager"].includes(data?.member_role);
  const matches=(e) => (!filters.day || e.day===filters.day) && (!filters.item || e.work_item_id===Number(filters.item)) && (!filters.author || (e.author_id || state.user?.id)===Number(filters.author));
  const journals=(data?.journals || []).filter(matches),pending=queue.filter((e) => matches(e.body));
  const authors=[...new Map((data?.journals || []).map((entry) => [entry.author_id,entry.author])).entries()];
  const retry=async (key) => { await retrySync(projectId,state.user.id,key); await registerBackgroundSync(); };
  return <><Notice tone="success">{message}</Notice><RemoteState state={{ ...state,reload }}>{data && <>
    <section className={`journal-sync journal-sync-${sync.state}`} role="status" aria-live="polite"><strong>{{ synced:"Đã đồng bộ",pending:"Chưa đồng bộ",syncing:"Đang đồng bộ",error:"Lỗi đồng bộ" }[sync.state]}</strong><span data-testid="pending-journals">{sync.journals} nhật ký chưa đồng bộ</span><span data-testid="pending-photos">{sync.photos} ảnh đang chờ</span>{sync.lastSuccess && !sync.journals && !sync.photos && <small>Lần thành công cuối: {new Date(sync.lastSuccess).toLocaleString("vi-VN")}</small>}<small>{navigator.onLine ? "Có kết nối" : "Đang làm việc offline"} · {background ? "Trình duyệt hỗ trợ Background Sync" : "Tự đồng bộ khi mở ứng dụng hoặc có mạng lại"}</small><button className="ops-btn" disabled={sync.syncing} onClick={() => retry()}>Thử đồng bộ lại</button>{sync.errors.length>0 && <details><summary>Xem {sync.errors.length} lỗi đồng bộ</summary>{sync.errors.map((e) => <p key={e.key}>{e.message} {e.conflict ? <button className="ops-btn" onClick={() => setModal({ kind:"history",record:{ id:e.conflict.journal_id },local:queue.find((j) => j.key===e.key) })}>So sánh hai bản</button> : <button className="ops-btn" onClick={() => retry(e.key)}>Thử lại {e.kind==="photo" ? "ảnh" : "nhật ký"}</button>}</p>)}</details>}</section>
    <div className="journal-storage"><span>{storage?.remaining!=null ? `Còn khoảng ${(storage.remaining/1024/1024).toFixed(0)} MB` : "Trình duyệt chưa cung cấp dung lượng lưu trữ"}{storage?.persistent ? " · Đã cấp lưu trữ bền" : ""}</span>{!storage?.persistent && <button className="ops-btn" onClick={async () => { const granted=await requestPersistentStorage(); setMessage(granted ? "Đã cấp lưu trữ bền trên thiết bị." : "Trình duyệt chưa cấp lưu trữ bền. Hàng đợi vẫn nằm trong IndexedDB."); setStorage(await storageStatus()); }}>Yêu cầu lưu trữ bền</button>}{storage?.nearFull && <Notice tone="warning">Bộ nhớ gần đầy. Đồng bộ trước khi thêm nhiều ảnh.</Notice>}</div>
    {!!sync.archives?.length && <details className="ops-notice"><summary>{sync.archives.length} ảnh của bản xung đột không được chọn vẫn lưu trên thiết bị</summary><p>Những ảnh này được giữ để đối chiếu và không tự gửi vào bản đã chọn.</p>{sync.archives.map((photo) => <ArchivedPhoto key={photo.key} photo={photo}/>)}</details>}
    <JournalOverview journals={data.journals} queue={queue} offline={!navigator.onLine} />
    <section className="ops-card"><div className="ops-card-head"><h2>Nhật ký công trường</h2><div className="ops-actions"><button className="ops-btn" onClick={reload}>Tải lại</button>{canWrite && <><button className="ops-btn" onClick={() => setModal({ kind:"lock" })}>Khóa / mở sổ</button><button className="ops-btn ops-create" onClick={() => setModal({ kind:"entry" })}>＋ Ghi nhật ký</button></>}{canManage && <button className="ops-btn" onClick={() => setModal({ kind:"catalog" })}>Cấu hình thời tiết / thiết bị</button>}</div></div>
    <div className="ops-toolbar"><label>Ngày<input type="date" value={filters.day} onChange={(e) => setFilters({ ...filters,day:e.target.value })} /></label><label>Hạng mục<select value={filters.item} onChange={(e) => setFilters({ ...filters,item:e.target.value })}><option value="">Tất cả</option>{data.items.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</select></label><label>Người ghi<select value={filters.author} onChange={(e) => setFilters({ ...filters,author:e.target.value })}><option value="">Tất cả</option>{authors.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>Đồng bộ<select value={filters.sync} onChange={(e) => setFilters({ ...filters,sync:e.target.value })}><option value="">Tất cả</option><option value="synced">Đã đồng bộ</option><option value="pending">Chưa đồng bộ</option></select></label></div>
    {filters.sync!=="synced" && pending.length>0 && <div className="ops-sync-queue"><strong>Bản ghi trên thiết bị</strong>{pending.map((entry) => <article key={entry.key}><p>{dateLabel(entry.body.day)} · {data.items.find((i) => i.id===entry.body.work_item_id)?.title}</p><p>{entry.body.content}</p><small>{entry.error || "Chưa đồng bộ"}</small><div className="ops-photo-picker">{entry.photos.map((p) => <LocalPhoto key={p.clientUuid} file={p.display || p.file} />)}</div><div className="ops-row-actions"><button className="ops-btn" disabled={sync.syncing || entry.status==="conflict"} onClick={() => setModal({ kind:"entry",pending:entry })}>Sửa bản nháp</button><button className="ops-btn" onClick={() => retry(entry.key)}>Thử lại</button><button className="ops-btn ops-danger" disabled={sync.syncing} onClick={() => setModal({ kind:"remove-pending",pending:entry })}>Xóa bản nháp</button></div></article>)}</div>}
    {filters.sync!=="pending" && (journals.length ? <div className="ops-journal-grid">{journals.map((entry) => <article className="ops-journal-entry" key={entry.id}><header><div><small>{dateLabel(entry.day)} · {entry.time.slice(0,5)}</small><h3>{entry.item_name}</h3></div><span className={`ops-badge ops-badge-${journalLocked(entry) ? "gray" : "green"}`}>{journalLocked(entry) ? "🔒 Đã khóa sổ" : "Đã đồng bộ"}</span></header><p>{entry.content}</p><div className="ops-journal-meta"><span>{entry.manpower} nhân lực</span><span>{entry.all_day_rain ? "☔ " : ""}{entry.weather}</span><span>{entry.equipment}</span></div><div className="ops-photo-picker">{entry.photo_ids.map((id) => <a key={id} href={photoUrl(projectId,id,true)} target="_blank" rel="noreferrer"><img loading="lazy" src={photoUrl(projectId,id)} alt={`Ảnh nhật ký ${id}`} /></a>)}{entry.photo_uploads?.filter((p) => !p.photo_id).map((p) => <span className="journal-photo-placeholder" key={p.client_uuid}>Ảnh đang chờ<br />{p.filename}</span>)}</div><footer><small>{entry.author}</small><div className="ops-row-actions"><button className="ops-btn" onClick={() => setModal({ kind:"history",record:entry })}>Chi tiết {entry.conflict_count>0 && `· ${entry.conflict_count} xung đột`}</button>{journalLocked(entry) && <button className="ops-btn" onClick={() => setModal({ kind:"entry",record:entry })}>Xem chi tiết</button>}{canWrite && !journalLocked(entry) && <button className="ops-btn" onClick={() => setModal({ kind:"entry",record:entry })}>Sửa</button>}{canWrite && !journalLocked(entry) && (entry.author_id===state.user.id || canManage) && <button className="ops-btn ops-danger" onClick={() => setModal({ kind:"delete",record:entry })}>Xóa</button>}</div></footer></article>)}</div> : <Empty>Chưa có nhật ký phù hợp.</Empty>)}
    {filters.sync==="pending" && !pending.length && <Empty>Không có bản ghi chờ đồng bộ.</Empty>}
    </section><DailyPanel key={`${filters.day}:${attempt}`} projectId={projectId} data={data} canWrite={canWrite} day={filters.day || today()} onSaved={reload} />
  </>}</RemoteState>
    {modal?.kind==="entry" && <JournalForm projectId={projectId} user={state.user} data={data} {...modal} onClose={() => setModal(null)} onSaved={saved} />}
    {modal?.kind==="history" && <JournalHistory projectId={projectId} record={modal.record} local={modal.local} canWrite={canWrite} onClose={() => setModal(null)} onSaved={serverSaved} />}
    {modal?.kind==="lock" && <RecordEditor title="Khóa / mở sổ nhật ký" initial={{ day:filters.day || today(),locked:"true",reason:"" }} fields={[{ name:"day",label:"Ngày",type:"date" },{ name:"locked",label:"Thao tác",type:"select",options:[{ value:"true",label:"Khóa sổ" },...(data.member_role==="admin" ? [{ value:"false",label:"Mở khóa" }] : [])] },{ name:"reason",label:"Lý do mở khóa",type:"textarea",when:(v) => v.locked==="false" }]} submit={(v) => api(projectPath(projectId,"/journals/lock"),{ method:"PUT",body:{ ...v,locked:v.locked==="true" } })} onClose={() => setModal(null)} onSaved={serverSaved} />}
    {modal?.kind==="delete" && <RecordEditor title="Xóa nhật ký" initial={{}} onClose={() => setModal(null)} onSaved={serverSaved} submitLabel="Xóa nhật ký" submit={() => api(projectPath(projectId,`/journals/${modal.record.id}`),{ method:"DELETE",body:{ revision:modal.record.revision } })}><p>Xóa nhật ký? Lịch sử vẫn được giữ.</p></RecordEditor>}
    {modal?.kind==="remove-pending" && <RecordEditor title="Xóa bản nháp trên thiết bị" initial={{}} onClose={() => setModal(null)} onSaved={saved} submitLabel="Xóa bản nháp" submit={() => removePending(modal.pending.key)}><p>Bản ghi và ảnh chưa đồng bộ sẽ bị xóa khỏi thiết bị.</p></RecordEditor>}
    {modal?.kind==="catalog" && <RecordEditor title="Cấu hình thời tiết / thiết bị" initial={{ kind:"weather",code:"",label:"",all_day_rain:"false",active:"true" }} fields={[{ name:"kind",label:"Loại",type:"select",options:[{ value:"weather",label:"Thời tiết" },{ value:"equipment",label:"Thiết bị" }] },{ name:"code",label:"Mã (nhập lại mã có sẵn để sửa)",type:"text" },{ name:"label",label:"Tên hiển thị",type:"text" },{ name:"all_day_rain",label:"Mưa cả ngày",type:"select",options:[{ value:"false",label:"Không" },{ value:"true",label:"Có" }] },{ name:"active",label:"Sử dụng",type:"select",options:[{ value:"true",label:"Có" },{ value:"false",label:"Ngừng sử dụng" }] }]} submit={(v) => api(projectPath(projectId,"/journals/catalog"),{ method:"PUT",body:{ ...v,all_day_rain:v.all_day_rain==="true",active:v.active==="true" } })} onClose={() => setModal(null)} onSaved={serverSaved}><p>{data.catalog.map((c) => `${c.code}: ${c.label}`).join(" · ")}</p></RecordEditor>}
  </>;
}
function RememberedJournal() {
  const navigate=useNavigate(),[checked,setChecked]=useState(false);
  useEffect(() => {
    let alive=true;
    (async () => {
      const q=globalThis.XdsJournalQueue,who=await q.get("control","identity"),last=who && await q.get("control",`last-project:${who.userId}`);
      if (alive && validProjectId(String(last?.projectId || ""))) navigate(`/site-journal?projectId=${last.projectId}`,{ replace:true });
      else if (alive) setChecked(true);
    })().catch(() => { if (alive) setChecked(true); });
    return () => { alive=false; };
  },[navigate]);
  return checked ? <NoProject/> : <p role="status">Đang mở nhật ký đã lưu trên thiết bị…</p>;
}
export default function SiteJournal() { const [params]=useSearchParams(),projectId=params.get("projectId"); return <DashboardLayout title="Nhật ký công trường" description="Ghi nhận diễn biến thi công, lưu trên thiết bị và tự đồng bộ.">{validProjectId(projectId) ? <ProjectJournal key={projectId} projectId={projectId} /> : <RememberedJournal/>}</DashboardLayout>; }
