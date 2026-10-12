/* Page and service worker share the same durable, identity-scoped queue. */
(() => {
  let database;
  const open=() => database ||= new Promise((resolve,reject) => {
    const r=indexedDB.open("xds-journal",2);
    r.onupgradeneeded=() => { for (const name of ["queue","cache","photos","control"]) if (!r.result.objectStoreNames.contains(name)) r.result.createObjectStore(name,{ keyPath:"key" }); };
    r.onsuccess=() => { r.result.onversionchange=() => { r.result.close(); database=null; }; resolve(r.result); };
    r.onerror=() => { database=null; reject(new Error("Không thể mở bộ nhớ nhật ký trên thiết bị.")); };
    r.onblocked=() => reject(new Error("Đóng các tab cũ để nâng cấp bộ nhớ nhật ký."));
  });
  async function transaction(stores,mode,fn) {
    const db=await open(); return new Promise((resolve,reject) => {
      const tx=db.transaction(stores,mode); let result;
      try { result=fn(tx); } catch(e) { tx.abort(); reject(e); return; }
      tx.oncomplete=() => resolve(result?.result);
      tx.onerror=tx.onabort=() => reject(tx.error || new Error("Không thể lưu trên thiết bị. Bộ nhớ có thể đã đầy; bản nháp vẫn ở trên màn hình."));
    });
  }
  const get=(s,k) => transaction(s,"readonly",(t) => t.objectStore(s).get(k));
  const all=(s) => transaction(s,"readonly",(t) => t.objectStore(s).getAll());
  const put=(s,v) => transaction(s,"readwrite",(t) => t.objectStore(s).put(v));
  const belongs=(e,p,u) => e.projectId===Number(p) && e.userId===Number(u);
  async function changed() {
    if (typeof window!=="undefined") window.dispatchEvent(new Event("xds-queue-changed"));
    else if (globalThis.clients) for (const c of await globalThis.clients.matchAll()) c.postMessage({ type:"XDS_QUEUE_CHANGED" });
  }
  async function identity(uid) {
    await transaction(["cache","control"],"readwrite",(t) => {
      if (uid==null) { t.objectStore("cache").delete("last-user"); t.objectStore("control").delete("identity"); }
      else { t.objectStore("cache").put({ key:"last-user",value:Number(uid) }); t.objectStore("control").put({ key:"identity",userId:Number(uid),generation:crypto.randomUUID() }); }
    }); await changed();
  }
  async function save(entry) {
    const photos=entry.photos || [],body={ ...entry.body,photo_ids:[...new Set([...(entry.body.photo_ids || []),...photos.filter((p) => p.photoId).map((p) => p.photoId)])],operation_uuid:entry.body.operation_uuid || crypto.randomUUID(),pending_photos:photos.filter((p) => !p.photoId).map((p) => ({ client_uuid:p.clientUuid,filename:p.file.name || p.filename })) };
    await transaction(["queue","photos"],"readwrite",(t) => {
      const jobs=t.objectStore("photos"),r=jobs.getAll();
      r.onsuccess=() => {
        for (const old of r.result) if (old.journalKey===entry.key && !old.serverId && !photos.some((p) => p.clientUuid===old.clientUuid)) jobs.delete(old.key);
        for (const p of photos) if (!p.photoId) jobs.put({ ...p,key:`${entry.key}:${p.clientUuid}`,journalKey:entry.key,userId:entry.userId,projectId:Number(entry.projectId),workItemId:body.work_item_id,status:"pending",attempts:0,nextAttemptAt:0,createdAt:entry.createdAt,error:null });
      };
      t.objectStore("queue").put({ ...entry,projectId:Number(entry.projectId),body,photos:[],status:"pending",attempts:0,nextAttemptAt:0,error:null,conflict:null });
    }); await changed();
  }
  async function pending(pid,uid) {
    const [entries,photos]=await Promise.all([all("queue"),all("photos")]);
    return entries.filter((e) => belongs(e,pid,uid)).sort((a,b) => a.createdAt-b.createdAt || a.key.localeCompare(b.key)).map((e) => ({ ...e,photos:e.photos?.length ? e.photos : photos.filter((p) => p.journalKey===e.key) }));
  }
  async function remove(key) {
    await transaction(["queue","photos"],"readwrite",(t) => {
      t.objectStore("queue").delete(key); const s=t.objectStore("photos"),r=s.getAll(); r.onsuccess=() => { for (const p of r.result) if (p.journalKey===key && !p.serverId) s.delete(p.key); };
    }); await changed();
  }
  async function status(pid,uid) {
    const [journals,photos,last,lease]=await Promise.all([all("queue"),all("photos"),get("control",`success:${uid}:${pid}`),get("control","sync-lease")]);
    const entries=journals.filter((e) => belongs(e,pid,uid)),images=photos.filter((e) => belongs(e,pid,uid) && e.status!=="archived"),archives=photos.filter((e) => belongs(e,pid,uid) && e.status==="archived");
    const errors=[...entries,...images].filter((e) => e.error).map((e) => ({ key:e.key,kind:e.file ? "photo" : "journal",message:e.error,status:e.status,conflict:e.conflict }));
    const syncing=lease?.expires>Date.now() && lease.userId===Number(uid);
    return { journals:entries.length,photos:images.length,photoEntries:images,archives,errors,lastSuccess:last?.at || null,syncing,state:syncing ? "syncing" : errors.length ? "error" : entries.length+images.length ? "pending" : "synced" };
  }
  async function retry(pid,uid,key) {
    for (const s of ["queue","photos"]) for (const e of await all(s)) if (belongs(e,pid,uid) && (!key || e.key===key) && !["conflict","archived"].includes(e.status)) await put(s,{ ...e,status:"pending",attempts:0,nextAttemptAt:0,error:null });
    await changed();
  }
  async function lease(uid) {
    const owner=crypto.randomUUID(); let accepted=false;
    await transaction("control","readwrite",(t) => { const s=t.objectStore("control"),r=s.get("sync-lease"); r.onsuccess=() => { if (!r.result || r.result.expires<Date.now()) { accepted=true; s.put({ key:"sync-lease",owner,userId:uid,expires:Date.now()+90000 }); } }; });
    return accepted ? owner : null;
  }
  async function renew(owner,release=false) {
    await transaction("control","readwrite",(t) => { const s=t.objectStore("control"),r=s.get("sync-lease"); r.onsuccess=() => { if (r.result?.owner===owner) { if (release) s.delete("sync-lease"); else s.put({ ...r.result,expires:Date.now()+90000 }); } }; });
  }
  async function request(path,body) {
    const response=await fetch(path,{ credentials:"include",headers:{ Accept:"application/json",...(body ? { "Content-Type":"application/json" } : {}) },...(body ? { method:"POST",body:JSON.stringify(body) } : {}),signal:AbortSignal.timeout(30000) });
    const value=await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(new Error(value?.message || `Lỗi máy chủ ${response.status}`),{ status:response.status }); return value;
  }
  const base64=async (blob) => { const bytes=new Uint8Array(await blob.arrayBuffer()); let binary=""; for (let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192)); return btoa(binary); };
  async function failed(s,entry,e) {
    const attempts=(entry.attempts || 0)+1,transient=!e.status || e.status>=500 || e.status===429;
    await put(s,{ ...entry,attempts,status:e.conflict ? "conflict" : transient && attempts<5 ? "retry" : "error",nextAttemptAt:Date.now()+Math.min(60000,1000*2**attempts),error:e.message || "Lỗi đồng bộ",conflict:e.conflict || null }); await changed();
  }
  const eligible=(e) => !["error","conflict","archived"].includes(e.status) && (e.attempts || 0)<5 && (e.nextAttemptAt || 0)<=Date.now();
  async function sync(pid,uid) {
    const who=await get("control","identity"); if (!who || who.userId!==Number(uid)) return { saved:0 };
    const jobs=[...await all("queue"),...await all("photos")].filter((e) => belongs(e,pid,uid));
    if (!jobs.some(eligible)) return { saved:0,retryable:jobs.some((e) => e.status==="retry" && (e.attempts || 0)<5) };
    const owner=await lease(Number(uid)); if (!owner) return { saved:0 };
    let saved=0;
    const active=async () => { const c=await get("control","identity"); if (c?.generation!==who.generation) return false; return (await request("/auth/me")).user.id===Number(uid); };
    try {
      if (!await active()) return { saved };
      for (const old of await pending(pid,uid)) if (old.photos?.length && !old.body.pending_photos) await save(old);
      await changed();
      while (true) {
        if (!await active()) break; await renew(owner);
        const entry=(await all("queue")).filter((e) => belongs(e,pid,uid) && eligible(e)).sort((a,b) => a.createdAt-b.createdAt || a.key.localeCompare(b.key))[0];
        if (entry) {
          try {
            const response=await request(`/projects/${pid}/journals/sync`,{ expected_user_id:Number(uid),entries:[entry.body] }),result=response.results[0];
            if (!result.ok) throw Object.assign(new Error(result.message || "Xung đột phiên bản: mở so sánh để chọn bản giữ"),{ status:result.status,conflict:result.conflict });
            if ((await get("control","identity"))?.generation!==who.generation) break;
            await transaction(["queue","photos"],"readwrite",(t) => {
              const queue=t.objectStore("queue"),check=queue.get(entry.key); check.onsuccess=() => { if (check.result?.body.operation_uuid===entry.body.operation_uuid) queue.delete(entry.key); };
              const photos=t.objectStore("photos"),r=photos.getAll(); r.onsuccess=() => { for (const p of r.result) if (p.journalKey===entry.key) photos.put({ ...p,serverId:result.journal.id }); };
            }); saved++; await changed();
          } catch(e) { await failed("queue",entry,e); if (e.status===401 || !e.status) break; }
          continue;
        }
        const photo=(await all("photos")).filter((e) => belongs(e,pid,uid) && e.serverId && eligible(e)).sort((a,b) => a.createdAt-b.createdAt || a.key.localeCompare(b.key))[0]; if (!photo) break;
        try {
          await request(`/projects/${pid}/photos`,{ expected_user_id:Number(uid),journal_id:photo.serverId,work_item_id:photo.workItemId,client_uuid:photo.clientUuid,filename:photo.file.name || photo.filename,data:await base64(photo.file),...(photo.display ? { display_data:await base64(photo.display) } : {}),...(photo.checksum ? { checksum:photo.checksum } : {}) });
          if ((await get("control","identity"))?.generation!==who.generation) break;
          await transaction("photos","readwrite",(t) => t.objectStore("photos").delete(photo.key)); await changed();
        } catch(e) { await failed("photos",photo,e); if (e.status===401 || !e.status) break; }
      }
      const remaining=await status(pid,uid); if (!remaining.journals && !remaining.photos) await put("control",{ key:`success:${uid}:${pid}`,at:Date.now() });
      return { saved,retryable:[...await all("queue"),...await all("photos")].some((e) => belongs(e,pid,uid) && e.status==="retry") };
    } finally { await renew(owner,true); await changed(); }
  }
  async function resolveLocal(key,serverId,chosen) {
    const entry=await get("queue",key);
    await transaction(["queue","photos"],"readwrite",(t) => {
      t.objectStore("queue").delete(key); const s=t.objectStore("photos"),r=s.getAll();
      r.onsuccess=() => { for (const p of r.result) if (p.journalKey===key) s.put(chosen==="incoming" ? { ...p,serverId,status:"pending",error:null } : { ...p,status:"archived",error:null }); };
    });
    if (entry) { const left=await status(entry.projectId,entry.userId); if (!left.journals && !left.photos) await put("control",{ key:`success:${entry.userId}:${entry.projectId}`,at:Date.now() }); }
    await changed();
  }
  globalThis.XdsJournalQueue={ get,all,put,save,pending,remove,status,retry,sync,identity,changed,resolveLocal };
})();
