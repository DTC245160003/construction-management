import { api,projectPath } from "./operationsApi.js";
const q=() => globalThis.XdsJournalQueue;
const cacheKey=(pid,uid) => `project:${pid}:user:${uid}`;
export const pendingJournals=(pid,uid) => q().pending(pid,uid);
export const queueStatus=(pid,uid) => q().status(pid,uid);
export const queueSnapshot=(pid,uid) => q().snapshot ? q().snapshot(pid,uid) : Promise.all([q().pending(pid,uid),q().status(pid,uid)]).then(([pending,status]) => ({pending,status}));
export const savePending=async (entry) => { await q().save(entry); await registerBackgroundSync(); };
export const removePending=(key) => q().remove(key);
export const clearOfflineIdentity=(options) => q().identity(null,options);
export const setOfflineIdentity=(uid) => q().identity(uid);
export const retrySync=(pid,uid,key) => q().retry(pid,uid,key);
export async function registerBackgroundSync() {
  const registrations=await navigator.serviceWorker?.getRegistrations().catch(() => []);
  const r=registrations?.find((r) => r.active?.scriptURL.endsWith("/journal-sw.js"));
  if (r?.sync) { try { await r.sync.register("xds-journals"); return true; } catch { /* Foreground retry stays available. */ } } return false;
}
export async function storageStatus() {
  const e=await navigator.storage?.estimate();
  return { usage:e?.usage ?? null,quota:e?.quota ?? null,remaining:e?.quota ? e.quota-e.usage : null,persistent:await navigator.storage?.persisted?.() || false,nearFull:e?.quota ? e.usage/e.quota>=0.8 : false };
}
export const requestPersistentStorage=() => navigator.storage?.persist?.() || Promise.resolve(false);
export async function loadJournals(pid,signal) {
  if (await q().get("control","logout")) throw Object.assign(new Error("Phiên đã đăng xuất. Vui lòng đăng nhập lại để mở nhật ký đã lưu."),{ status:401 });
  let identity=await q().get("control","identity");
  const sessionChanged=async () => signal?.aborted || await q().get("control","logout") || (await q().get("control","identity"))?.generation!==identity?.generation;
  const aborted=() => new DOMException("Phiên làm việc đã thay đổi.","AbortError");
  try {
    const [{ user },data]=await Promise.all([api("/auth/me",{ signal }),api(projectPath(pid,"/journals"),{ signal })]);
    if (await sessionChanged()) throw aborted();
    if (identity?.userId!==user.id) {
      const restored=await q().identity(user.id,{ expectedGeneration:identity?.generation });
      if (!restored) throw aborted(); identity=restored;
    }
    if (await sessionChanged()) throw aborted();
    const result={ user,data,offline:false }; await q().put("cache",{ key:cacheKey(pid,user.id),value:result });
    if (await sessionChanged()) throw aborted();
    await q().put("control",{ key:`last-project:${user.id}`,projectId:Number(pid) }); return result;
  } catch(e) {
    if (e.name==="AbortError" || await sessionChanged()) throw aborted();
    if (e.status) { if (e.status===401 || e.status===403) await clearOfflineIdentity({ expectedGeneration:identity?.generation,logout:e.status===401 }); throw e; }
    let who=await q().get("control","identity");
    if (!who) { const legacy=await q().get("cache","last-user"); if (legacy) { const restored=await q().identity(legacy.value,{ expectedGeneration:identity?.generation }); if (!restored) throw aborted(); identity=who=restored; } }
    if (await sessionChanged()) throw aborted();
    const stored=who && await q().get("cache",cacheKey(pid,who.userId));
    if (await sessionChanged()) throw aborted();
    if (!stored) throw new Error("Chưa có dữ liệu dự án lưu trên thiết bị. Kết nối mạng và mở nhật ký một lần trước khi làm việc offline.",{ cause:e }); return { ...stored.value,data:{ ...stored.value.data,catalog:stored.value.data.catalog || [] },offline:true };
  }
}
export const syncJournals=async (pid,uid) => (await q().sync(pid,uid)).saved;
