import { useEffect,useState } from "react";
export default function PwaUpdate() {
  const [worker,setWorker]=useState(null),[busy,setBusy]=useState(false),[install,setInstall]=useState(null);
  useEffect(() => {
    if (!navigator.serviceWorker) return;
    let alive=true;
    const inspect=(registration) => { if (alive && registration.waiting && navigator.serviceWorker.controller) setWorker(registration.waiting); };
    const check=async () => { for (const r of await navigator.serviceWorker.getRegistrations()) { inspect(r); r.addEventListener("updatefound",() => r.installing?.addEventListener("statechange",() => inspect(r))); } };
    const installed=(event) => { event.preventDefault(); setInstall(event); };
    check(); const timer=setInterval(check,15000); window.addEventListener("beforeinstallprompt",installed);
    return () => { alive=false; clearInterval(timer); window.removeEventListener("beforeinstallprompt",installed); };
  },[]);
  async function update() {
    if (document.querySelector('dialog[open],.ant-modal-wrap:not([style*="display: none"])') || globalThis.xdsJournalEditing) { setBusy(true); return; }
    navigator.serviceWorker.addEventListener("controllerchange",() => location.reload(),{ once:true }); worker.postMessage({ type:"XDS_UPDATE_CONFIRMED" });
  }
  return <>{worker && <div className="ops-notice" role="status">Có phiên bản mới. Lưu và đóng biểu mẫu trước khi cập nhật. <button className="ops-btn" onClick={update}>Cập nhật ứng dụng</button>{busy && <span> Đóng biểu mẫu đang nhập rồi bấm cập nhật.</span>}</div>}{install && <button className="ops-btn" onClick={async () => { await install.prompt(); setInstall(null); }}>Cài lên màn hình chính</button>}</>;
}
