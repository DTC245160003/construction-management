/* Only public application shell resources enter CacheStorage. */
importScripts("/journal-queue.js");
const CACHE_PREFIX="xds-journal-shell-",CACHE=`${CACHE_PREFIX}__XDS_BUILD__`;
const STATIC=["/","/site-journal","/journal-queue.js","/manifest.webmanifest","/icons/icon-192.png","/icons/icon-512.png"];
const ASSET=/^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;
self.addEventListener("install",(event) => event.waitUntil((async () => {
  const cache=await caches.open(CACHE),response=await fetch("/",{ cache:"reload" }),html=await response.text();
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error("Shell unavailable");
  await cache.addAll(STATIC);
  const paths=[...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map((m) => m[1]).filter((p) => ASSET.test(p));
  await cache.addAll(paths);
})()));
self.addEventListener("activate",(event) => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith(CACHE_PREFIX) && key!==CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener("message",(event) => {
  if (event.data?.type==="XDS_UPDATE_CONFIRMED") event.waitUntil(self.skipWaiting());
});
self.addEventListener("fetch",(event) => {
  const r=event.request,url=new URL(r.url);
  if (r.method!=="GET" || url.origin!==self.location.origin) return;
  if (r.mode==="navigate") { event.respondWith((async () => (await (await caches.open(CACHE)).match("/")) || fetch(r))()); return; }
  if (ASSET.test(url.pathname) || STATIC.includes(url.pathname)) event.respondWith((async () => {
    const cache=await caches.open(CACHE),hit=await cache.match(r); if (hit) return hit;
    const response=await fetch(r); if (response.ok) await cache.put(r,response.clone()); return response;
  })());
});
self.addEventListener("sync",(event) => {
  if (event.tag!=="xds-journals") return;
  event.waitUntil((async () => {
    const q=self.XdsJournalQueue,who=await q.get("control","identity"); if (!who) return;
    const projects=[...new Set([...await q.all("queue"),...await q.all("photos")].filter((e) => e.userId===who.userId).map((e) => e.projectId))];
    let retry=false;
    for (const pid of projects) { const result=await q.sync(pid,who.userId); retry ||= result.retryable; }
    if (retry) throw new Error("Transient queue failures: browser may retry with backoff");
  })());
});
