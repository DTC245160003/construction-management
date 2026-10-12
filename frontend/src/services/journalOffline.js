import { api,projectPath } from "./operationsApi";
const q=() => globalThis.XdsJournalQueue;
const cacheKey=(pid,uid) => `project:${pid}:user:${uid}`;
export const pendingJournals=(pid,uid) => q().pending(pid,uid);
export const queueStatus=(pid,uid) => q().status(pid,uid);
export const savePending=async (entry) => { await q().save(entry); await registerBackgroundSync(); };
export const removePending=(key) => q().remove(key);
export const clearOfflineIdentity=() => q().identity(null);
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
  try {
    const [{ user },data]=await Promise.all([api("/auth/me",{ signal }),api(projectPath(pid,"/journals"),{ signal })]);
    if ((await q().get("control","identity"))?.userId!==user.id) await setOfflineIdentity(user.id);
    const result={ user,data,offline:false }; await q().put("cache",{ key:cacheKey(pid,user.id),value:result }); await q().put("control",{ key:`last-project:${user.id}`,projectId:Number(pid) }); return result;
  } catch(e) {
    if (signal?.aborted || e.status) { if (e.status===401 || e.status===403) await clearOfflineIdentity(); throw e; }
    let who=await q().get("control","identity");
    if (!who) { const legacy=await q().get("cache","last-user"); if (legacy) { await setOfflineIdentity(legacy.value); who=await q().get("control","identity"); } }
    const stored=who && await q().get("cache",cacheKey(pid,who.userId));
    if (!stored) throw new Error("Chưa có dữ liệu dự án lưu trên thiết bị. Kết nối mạng và mở nhật ký một lần trước khi làm việc offline.",{ cause:e }); return { ...stored.value,data:{ ...stored.value.data,catalog:stored.value.data.catalog || [] },offline:true };
  }
}
export const syncJournals=async (pid,uid) => (await q().sync(pid,uid)).saved;
