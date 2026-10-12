import { chromium,expect,test } from "@playwright/test";
import { Buffer } from "node:buffer";
import { mkdtemp,rm } from "node:fs/promises";
import { join,resolve,sep } from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";
import { createRequire } from "node:module";
const backendRequire=createRequire(new URL("../../backend/package.json",import.meta.url));
const photo={ name:"site.jpg",mimeType:"image/jpeg",buffer:Buffer.from("/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABv/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AIABqGv/2Q==","base64") };
const api="http://127.0.0.1:3031";
async function login(page,role="engineer") {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(`${role}@e2e.test`);
  await page.locator('input[type="password"]').fill("Operations-only-E2E-123!");
  await page.getByRole("button",{ name:"Đăng nhập",exact:true }).click(); await expect(page).toHaveURL(/\/home/);
}
async function setup(page) {
  await login(page);
  const f=await (await page.request.post(`${api}/__sprint45/project`)).json();
  await page.goto(`/site-journal?projectId=${f.projectId}`);
  await expect(page.getByRole("button",{ name:"＋ Ghi nhật ký",exact:true })).toBeVisible();
  await page.evaluate(async () => {
    const registration=await navigator.serviceWorker.register("/journal-sw.js",{ updateViaCache:"none" });
    await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject) => setTimeout(() => reject(new Error(`Worker not ready: active=${registration.active?.state}, installing=${registration.installing?.state}, waiting=${registration.waiting?.state}`)),12000))]);
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange",resolve,{ once:true }));
  });
  return f;
}
async function add(page,n,images=1,file=photo) {
  await page.getByRole("button",{ name:"＋ Ghi nhật ký",exact:true }).click(); const d=page.getByRole("dialog");
  await d.getByRole("combobox",{ name:"Hạng mục",exact:true }).selectOption({ index:1 });
  await d.getByLabel("Ngày",{ exact:true }).fill("2026-10-05");
  await d.getByLabel("Nội dung công việc").fill(`Offline Sprint45 ${n}`);
  await d.getByLabel("Nhân lực trong ngày").fill("8");
  await d.getByRole("combobox",{ name:"Thời tiết",exact:true }).selectOption("sunny");
  await d.getByLabel("Chọn nhiều ảnh",{ exact:false }).setInputFiles(Array.from({ length:images },(_,i) => ({ ...file,name:`site-${n}-${i}.jpg` })));
  await expect(d.getByText("Đang nén ảnh dưới 1 MB…")).toHaveCount(0);
  await d.getByRole("button",{ name:"Lưu nhật ký",exact:true }).click(); await expect(d).toHaveCount(0);
}
async function evidence(page,pid) { return (await page.request.get(`${api}/__sprint45/evidence?projectId=${pid}`)).json(); }
async function removeTestProfile(profile,directory) {
  if (!resolve(profile).startsWith(resolve(directory)+sep)) throw new Error("Unexpected test profile path");
  await rm(profile,{ recursive:true,force:true });
}
test("S-34: offline 20 journals + 30 photos survive reload and browser restart, sync once and replay without duplicates",async ({ browserName }) => {
  expect(browserName).toBe("chromium");
  const profile=await mkdtemp(join(tmpdir(),"xds-s45-")),options={ headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || (process.platform==="win32" ? "chrome" : undefined),baseURL:"http://127.0.0.1:4175" };
  let context=await chromium.launchPersistentContext(profile,options),page=context.pages()[0];
  try {
  const start=Date.now(),errors=[]; page.on("pageerror",(e) => errors.push(e.message));
  const sharp=backendRequire("sharp"),pixels=Buffer.alloc(2200*1650*3); let seed=12847;
  for (let i=0;i<pixels.length;i++) { seed^=seed<<13; seed^=seed>>>17; seed^=seed<<5; pixels[i]=seed>>>24; }
  const largePhoto={ name:"camera-size-fixture.jpg",mimeType:"image/jpeg",buffer:await sharp(pixels,{ raw:{ width:2200,height:1650,channels:3 } }).jpeg({ quality:88 }).toBuffer() }; expect(largePhoto.buffer.length).toBeGreaterThan(1048576);
  const { projectId }=await setup(page);
  await page.request.post(`${api}/__sprint45/network`,{ data:{ projectId,unavailable:true } });
  await context.setOffline(true);
  for (let i=0;i<20;i++) await add(page,i,i<10 ? 2 : 1,largePhoto);
  await expect(page.getByTestId("pending-journals")).toHaveText("20 nhật ký chưa đồng bộ");
  await expect(page.getByTestId("pending-photos")).toHaveText("30 ảnh đang chờ");
  const initial=await page.evaluate(async () => ({ jobs:await globalThis.XdsJournalQueue.all("queue"),photos:(await globalThis.XdsJournalQueue.all("photos")).map((p) => ({ originalBytes:p.file.size,displayBytes:p.display.size,checksum:p.checksum })) }));
  expect(initial.jobs).toHaveLength(20); expect(initial.photos).toHaveLength(30);
  expect(initial.photos.every((p) => p.originalBytes>1048576 && p.displayBytes<1048576 && p.checksum.length===64)).toBe(true);
  await page.reload(); await expect(page.locator(".ops-sync-queue article")).toHaveCount(20);
  const shellOpenMs=await page.evaluate(() => performance.now()); expect(shellOpenMs).toBeLessThan(1000);
  await context.close(); context=await chromium.launchPersistentContext(profile,{ ...options,offline:true }); await context.setOffline(true); page=context.pages()[0]; page.on("pageerror",(e) => errors.push(e.message)); await page.goto("/site-journal");
  expect(await page.evaluate(() => navigator.onLine)).toBe(false); await expect(page).toHaveURL(new RegExp(`projectId=${projectId}$`));
  await expect(page.locator(".ops-sync-queue article")).toHaveCount(20);
  await page.setViewportSize({ width:390,height:844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({ path:test.info().outputPath("offline-20-mobile.png"),fullPage:true });
  expect((await evidence(page,projectId)).journals).toHaveLength(0);
  await page.request.post(`${api}/__sprint45/network`,{ data:{ projectId,unavailable:false } });
  await context.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByTestId("pending-journals")).toHaveText("0 nhật ký chưa đồng bộ",{ timeout:40000 });
  await expect(page.getByTestId("pending-photos")).toHaveText("0 ảnh đang chờ",{ timeout:60000 });
  await expect.poll(async () => (await evidence(page,projectId)).journals.length).toBe(20);
  const before=await evidence(page,projectId); expect(before.photos).toBe(30); expect(before.daily).toBe(1); expect(new Set(before.journals.map((j) => j.client_uuid)).size).toBe(20);
  expect(before.originalPhotoBytes).toBe(initial.photos.reduce((n,p) => n+p.originalBytes,0)); expect(before.maxThumbnailBytes).toBeLessThan(1048576);
  const response=await page.request.post(`/projects/${projectId}/journals/sync`,{ data:{ entries:[initial.jobs[0].body] } }); expect(response.status()).toBe(200); expect((await response.json()).results[0].replayed).toBe(true);
  expect((await evidence(page,projectId)).journals).toHaveLength(20);
  await page.getByRole("button",{ name:"Tải lại",exact:true }).click(); await expect(page.locator(".ops-journal-entry")).toHaveCount(20);
  await expect(page.locator("section.journal-sync")).toContainText("Lần thành công cuối"); expect(errors).toEqual([]);
  const elapsed=Date.now()-start; expect(elapsed).toBeLessThan(180000);
  await test.info().attach("postgres-evidence",{ body:JSON.stringify({ ...before,elapsedMs:elapsed,shellOpenMs,originalBytesPerPhoto:initial.photos[0].originalBytes,compressedBytesPerPhoto:initial.photos[0].displayBytes,totalOriginalBytes:initial.photos.reduce((n,p) => n+p.originalBytes,0),duplicateReplay:true,queueEmpty:true,browserRestartSurvival:true,offlinePwaStart:true },null,2),contentType:"application/json" });
  await page.screenshot({ path:test.info().outputPath("synced-20-mobile.png"),fullPage:true });
  } finally { await context.close(); await removeTestProfile(profile,tmpdir()); }
});
test("invalid entry continues, lost responses retry safely, placeholders appear and new journals do not wait for photo upload",async ({ page,context }) => {
  const { projectId }=await setup(page); await context.setOffline(true); await add(page,"invalid"); await add(page,"valid");
  await page.evaluate(async () => { const entry=(await globalThis.XdsJournalQueue.all("queue"))[0]; entry.body.work_item_id=2147483647; await globalThis.XdsJournalQueue.put("queue",entry); });
  let dropped=false;
  await context.route(`**/projects/${projectId}/journals/sync`,async (route) => { if (!dropped) { const response=await route.fetch(); if ((await response.json()).results[0].ok) { dropped=true; await route.abort("failed"); return; } await route.fulfill({ response }); } else await route.continue(); });
  await context.route(`**/projects/${projectId}/photos`,(route) => route.abort("failed"));
  await context.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(async () => (await evidence(page,projectId)).journals.length).toBe(1);
  await page.getByRole("button",{ name:"Thử đồng bộ lại",exact:true }).click();
  await expect(page.getByTestId("pending-journals")).toHaveText("1 nhật ký chưa đồng bộ");
  await page.getByRole("button",{ name:"Tải lại",exact:true }).click(); await expect(page.locator(".journal-photo-placeholder")).toHaveCount(1);
  await add(page,"while-photos-pending"); await expect.poll(async () => (await evidence(page,projectId)).journals.length).toBe(2);
  await context.unroute(`**/projects/${projectId}/photos`); await page.getByRole("button",{ name:"Thử đồng bộ lại",exact:true }).click();
  await expect.poll(async () => (await evidence(page,projectId)).photos).toBe(2);
  expect((await evidence(page,projectId)).journals).toHaveLength(2);
  await expect(page.locator("section.journal-sync")).toContainText("Không tìm thấy hạng mục");
});
test("conflict comparison UI retains both versions and lock/unlock is enforced through direct API",async ({ page }) => {
  const { projectId,workItemId }=await setup(page),base={ work_item_id:workItemId,client_uuid:crypto.randomUUID(),operation_uuid:crypto.randomUUID(),day:"2026-10-05",time:"08:30",content:"Gốc",photo_ids:[],manpower:8,weather_code:"sunny",equipment_codes:[],daily_revision:0 };
  const j=(await (await page.request.post(`/projects/${projectId}/journals`,{ data:base })).json()).journal;
  await page.request.put(`/projects/${projectId}/journals/${j.id}`,{ data:{ ...base,operation_uuid:crypto.randomUUID(),revision:1,content:"Bản A",daily_revision:1 } });
  const response=await page.request.put(`/projects/${projectId}/journals/${j.id}`,{ data:{ ...base,operation_uuid:crypto.randomUUID(),revision:1,content:"Bản B",daily_revision:1 } }); expect(response.status()).toBe(409);
  await page.getByRole("button",{ name:"Tải lại",exact:true }).click(); await page.getByRole("button",{ name:/Chi tiết.*1 xung đột/ }).click();
  await expect(page.locator(".journal-compare article")).toHaveCount(2); await expect(page.locator(".journal-compare")).toContainText("Bản A"); await expect(page.locator(".journal-compare")).toContainText("Bản B");
  await page.getByRole("button",{ name:"Giữ bản gửi đến",exact:true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.locator(".ops-journal-entry")).toContainText("Bản B");
  await page.request.put(`/projects/${projectId}/journals/lock`,{ data:{ day:base.day,locked:true } });
  expect((await page.request.put(`/projects/${projectId}/journals/${j.id}`,{ data:{ ...base,operation_uuid:crypto.randomUUID(),revision:3 } })).status()).toBe(409);
  expect((await page.request.put(`/projects/${projectId}/journals/lock`,{ data:{ day:base.day,locked:false,reason:"Bổ sung" } })).status()).toBe(403);
  await page.request.post("/auth/login",{ data:{ email:"admin@e2e.test",password:"Operations-only-E2E-123!" } });
  expect((await page.request.put(`/projects/${projectId}/journals/lock`,{ data:{ day:base.day,locked:false,reason:"" } })).status()).toBe(400);
  expect((await page.request.put(`/projects/${projectId}/journals/lock`,{ data:{ day:base.day,locked:false,reason:"Bổ sung hồ sơ" } })).status()).toBe(200);
});
test("service worker caches only shell, has install icons, and logout retains drafts without syncing as another account",async ({ page,context }) => {
  const { projectId }=await setup(page),manifest=await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone"); expect(manifest.icons.map((i) => i.sizes)).toEqual(["192x192","512x512"]);
  await context.setOffline(true); await add(page,"private"); await page.evaluate(async () => globalThis.XdsJournalQueue.identity(null));
  await context.setOffline(false); await page.request.post("/auth/login",{ data:{ email:"worker@e2e.test",password:"Operations-only-E2E-123!" } });
  await page.evaluate(async () => { const me=await (await fetch("/auth/me",{ headers:{ Accept:"application/json" } })).json(); await globalThis.XdsJournalQueue.identity(me.user.id); const entry=(await globalThis.XdsJournalQueue.all("queue"))[0]; await globalThis.XdsJournalQueue.sync(entry.projectId,entry.userId); });
  expect((await evidence(page,projectId)).journals).toHaveLength(0);
  expect(await page.evaluate(async () => (await globalThis.XdsJournalQueue.all("queue")).length)).toBe(1);
  const keys=await page.evaluate(async () => { const result=[]; for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) result.push(new URL(r.url).pathname); return result; });
  expect(keys.some((k) => /^\/(auth|projects)(\/|$)/.test(k))).toBe(false); expect(keys.some((k) => k.startsWith("/assets/"))).toBe(true);
});

test("member UI creates a usable invitation, accepts first password, adds existing accounts and preserves last manager",async ({ page,browser }) => {
  const { projectId }=await setup(page); await login(page,"admin");
  await page.goto(`/members?projectId=${projectId}`);
  const email=`invite-${crypto.randomUUID()}@e2e.test`;
  await page.getByRole("button",{ name:"Mời thành viên",exact:true }).click();
  let d=page.getByRole("dialog"); await d.getByLabel("Email thành viên").fill(email); await d.getByLabel("Vai trò trong dự án").selectOption("worker"); await d.getByRole("button",{ name:"Gửi lời mời",exact:true }).click();
  const link=await d.getByLabel("Liên kết lời mời").inputValue(); expect(link).toContain("/accept-invitation?"); await d.getByRole("button",{ name:"Đóng",exact:true }).click();
  await page.getByRole("tab",{ name:"Lời mời chờ xử lý" }).click(); await expect(page.getByRole("tabpanel")).toContainText(email);
  const invitedContext=await browser.newContext({ baseURL:"http://127.0.0.1:4175" });
  try {
    const invited=await invitedContext.newPage(); await invited.goto(link); await invited.getByLabel("Họ và tên").fill("Đội trưởng được mời"); await invited.getByLabel("Mật khẩu mới").fill("Operations-only-E2E-123!"); await invited.getByRole("button",{ name:"Thiết lập và đăng nhập" }).click(); await expect(invited).toHaveURL(/\/projects$/);
    await expect(invited.locator(".ops-project-card")).toContainText("Sprint45 browser test");
    const me=await (await invited.request.get("/auth/me")).json();
    await page.reload(); await expect(page.getByRole("row").filter({ hasText:email })).toContainText("Đội trưởng");
    await page.getByRole("button",{ name:"Thao tác với Đội trưởng được mời",exact:true }).click(); await page.getByRole("button",{ name:"Gỡ thành viên Đội trưởng được mời",exact:true }).click(); await page.getByRole("dialog").getByRole("button",{ name:"Xác nhận",exact:true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.getByRole("row").filter({ hasText:email })).toHaveCount(0);
    expect((await invited.request.get(`/projects/${projectId}/assignments`)).status()).toBe(403);
    await page.getByRole("button",{ name:"Mời thành viên",exact:true }).click(); d=page.getByRole("dialog"); await d.getByLabel("Email thành viên").fill(email); await d.getByLabel("Vai trò trong dự án").selectOption("engineer"); await d.getByRole("button",{ name:"Gửi lời mời",exact:true }).click(); await expect(d).toHaveCount(0);
    await expect(page.getByRole("row").filter({ hasText:email })).toContainText("Kỹ sư giám sát");
    expect((await invited.request.get(`/projects/${projectId}/journals`)).status()).toBe(200);
    expect(me.user.role).toBe("engineer"); // Project role is independent of the account's global role.
  } finally { await invitedContext.close(); }
  const single=(await (await page.request.post("/projects",{ data:{ name:"Chỉ một ban quản lý",location:"E2E",start_date:"2026-10-01" } })).json()).project;
  await page.goto(`/members?projectId=${single.id}`); await page.getByRole("button",{ name:"Thao tác với Kiểm thử admin",exact:true }).click(); await page.getByRole("button",{ name:"Gỡ thành viên Kiểm thử admin",exact:true }).click();
  await page.getByRole("dialog").getByRole("button",{ name:"Xác nhận",exact:true }).click(); await expect(page.getByRole("dialog").getByRole("alert")).toContainText("cuối cùng");
});

test("field UI creates and edits real tasks, creates team, assigns, filters and displays worker reporting on mobile",async ({ page,browser }) => {
  const errors=[]; page.on("pageerror",(e) => errors.push(e.message));
  const { projectId }=await setup(page); await login(page,"project_manager"); await page.goto(`/field-assignments?projectId=${projectId}`);
  await page.getByRole("button",{ name:"＋ Tạo công việc",exact:true }).click(); let d=page.getByRole("dialog");
  await d.getByLabel("Tên công việc",{ exact:true }).fill("Đổ bê tông UI"); await d.locator(".ant-select").first().click(); await page.getByText("Móng E2E",{ exact:true }).last().click(); await d.getByRole("button",{ name:"Lưu công việc",exact:true }).click(); await expect(d).toHaveCount(0);
  let row=page.getByRole("row").filter({ hasText:"Đổ bê tông UI" }); await row.getByRole("button",{ name:"Sửa việc",exact:true }).click(); d=page.getByRole("dialog"); await d.getByLabel("Tên công việc",{ exact:true }).fill("Đổ bê tông đã sửa"); await d.getByRole("button",{ name:"Lưu công việc",exact:true }).click(); await expect(d).toHaveCount(0);
  row=page.getByRole("row").filter({ hasText:"Đổ bê tông đã sửa" });
  await page.getByRole("button",{ name:"＋ Tạo đội thi công",exact:true }).click(); d=page.getByRole("dialog"); await d.getByLabel("Tên đội",{ exact:true }).fill("Đội móng UI"); await d.getByRole("checkbox",{ name:/Đội trưởng kiểm thử/ }).check(); await d.getByRole("button",{ name:"Tạo đội",exact:true }).click(); await expect(d).toHaveCount(0);
  await row.getByRole("button",{ name:"Gán đội",exact:true }).click(); d=page.getByRole("dialog"); await d.getByRole("combobox",{ name:"Đội phụ trách",exact:true }).selectOption({ label:"Đội móng UI (1 thành viên)" }); await d.getByRole("button",{ name:"Lưu",exact:true }).click(); await expect(d).toHaveCount(0);
  await row.getByRole("button",{ name:"Kế hoạch",exact:true }).click(); d=page.getByRole("dialog"); await d.getByLabel("Khối lượng kế hoạch",{ exact:true }).fill("10"); await d.getByLabel("Đơn vị",{ exact:true }).fill("m³"); await d.getByRole("button",{ name:"Lưu",exact:true }).click(); await expect(d).toHaveCount(0);
  const workerContext=await browser.newContext({ baseURL:"http://127.0.0.1:4175",viewport:{ width:390,height:844 } });
  try {
    const worker=await workerContext.newPage(); await login(worker,"worker"); await worker.goto(`/field-assignments?projectId=${projectId}`);
    await expect(worker.getByRole("table")).toContainText("Găng"); await worker.getByRole("button",{ name:"Báo khối lượng",exact:true }).click(); d=worker.getByRole("dialog"); await d.getByLabel("Khối lượng (m³)", { exact:true }).fill("12"); await d.getByRole("button",{ name:"Gửi báo cáo",exact:true }).click(); await expect(d).toHaveCount(0);
    await expect(worker.getByRole("status").filter({ hasText:"vượt" })).toBeVisible(); await expect(worker.getByRole("table")).toContainText("12 / 10 m³"); expect(await worker.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const size=await worker.getByRole("button",{ name:"Báo khối lượng",exact:true }).boundingBox(); expect(size.height).toBeGreaterThanOrEqual(44);
    await worker.screenshot({ path:test.info().outputPath("worker-report-mobile.png"),fullPage:true });
  } finally { await workerContext.close(); }
  await page.reload(); await row.getByRole("button",{ name:"Chi tiết",exact:true }).click(); await expect(page.getByRole("dialog")).toContainText("Đội trưởng kiểm thử"); await expect(page.getByRole("dialog")).toContainText("Đội móng UI"); expect(errors).toEqual([]);
});

test("quota failure retains the form; cached shell opens quickly and waiting worker requires explicit update without losing drafts",async ({ page,context }) => {
  const { projectId }=await setup(page); await context.setOffline(true);
  await page.evaluate(() => { globalThis.originalIdbTransaction=IDBDatabase.prototype.transaction; IDBDatabase.prototype.transaction=function(stores,mode,...args) { if (mode==="readwrite" && Array.from(typeof stores==="string" ? [stores] : stores).includes("queue")) throw new DOMException("Bộ nhớ thiết bị đầy","QuotaExceededError"); return globalThis.originalIdbTransaction.call(this,stores,mode,...args); }; });
  await page.getByRole("button",{ name:"＋ Ghi nhật ký",exact:true }).click(); let d=page.getByRole("dialog"); await d.getByRole("combobox",{ name:"Hạng mục",exact:true }).selectOption({ index:1 }); await d.getByLabel("Nội dung công việc").fill("Bản nháp không mất khi đầy bộ nhớ"); await d.getByRole("combobox",{ name:"Thời tiết",exact:true }).selectOption("sunny"); await d.getByRole("button",{ name:"Lưu nhật ký",exact:true }).click(); await expect(d.getByRole("alert")).toContainText("đầy"); await expect(d.getByLabel("Nội dung công việc")).toHaveValue("Bản nháp không mất khi đầy bộ nhớ");
  expect(await page.evaluate(async () => (await globalThis.XdsJournalQueue.all("queue")).length)).toBe(0);
  await page.evaluate(() => { IDBDatabase.prototype.transaction=globalThis.originalIdbTransaction; }); await d.getByRole("button",{ name:"Lưu nhật ký",exact:true }).click(); await expect(d).toHaveCount(0);
  await page.reload(); await expect(page.getByTestId("pending-journals")).toHaveText("1 nhật ký chưa đồng bộ");
  const warmShellMs=await page.evaluate(() => performance.now()); expect(warmShellMs).toBeLessThan(1000);
  await context.route(`**/projects/${projectId}/journals/sync`,(r) => r.abort("failed")); await context.setOffline(false);
  await page.evaluate(async () => { const r=await navigator.serviceWorker.register("/journal-sw.js?update-test=1",{ scope:"/" }); if (!r.waiting) await new Promise((resolve) => r.installing.addEventListener("statechange",() => { if (r.waiting) resolve(); })); });
  await expect(page.getByRole("button",{ name:"Cập nhật ứng dụng",exact:true })).toBeVisible();
  await page.getByRole("button",{ name:"＋ Ghi nhật ký",exact:true }).click(); d=page.getByRole("dialog"); await d.getByLabel("Nội dung công việc").fill("Đang nhập khi có cập nhật");
  await page.evaluate(() => document.querySelector(".ops-notice button").click()); await expect(page.getByText("Đóng biểu mẫu đang nhập rồi bấm cập nhật.",{ exact:false })).toBeVisible(); await expect(d.getByLabel("Nội dung công việc")).toHaveValue("Đang nhập khi có cập nhật");
  await d.getByRole("button",{ name:"Hủy",exact:true }).click(); await page.getByRole("button",{ name:"Cập nhật ứng dụng",exact:true }).click();
  await expect(page.getByRole("button",{ name:"Cập nhật ứng dụng",exact:true })).toHaveCount(0); await expect(page.getByTestId("pending-journals")).toHaveText("1 nhật ký chưa đồng bộ");
  await test.info().attach("warm-shell-quota-update",{ body:JSON.stringify({ warmShellMs,quotaDraftRetained:true,explicitUpdate:true,queueRetainedAfterUpdate:true }),contentType:"application/json" });
});

test("rejecting an incoming conflicting version retains its original photos locally without a stuck upload queue",async ({ page }) => {
  const { projectId,workItemId }=await setup(page),base={ work_item_id:workItemId,client_uuid:crypto.randomUUID(),operation_uuid:crypto.randomUUID(),day:"2026-10-05",time:"08:30",content:"Gốc có ảnh xung đột",photo_ids:[],manpower:8,weather_code:"sunny",equipment_codes:[],daily_revision:0 };
  const journal=(await (await page.request.post(`/projects/${projectId}/journals`,{ data:base })).json()).journal;
  await page.getByRole("button",{ name:"Tải lại",exact:true }).click(); await page.locator(".ops-journal-entry").getByRole("button",{ name:"Sửa",exact:true }).click(); const d=page.getByRole("dialog");
  await page.request.put(`/projects/${projectId}/journals/${journal.id}`,{ data:{ ...base,revision:1,daily_revision:1,operation_uuid:crypto.randomUUID(),content:"Bản máy chủ được giữ" } });
  await d.getByLabel("Nội dung công việc").fill("Bản gửi đến có ảnh"); await d.getByLabel("Chọn nhiều ảnh",{ exact:false }).setInputFiles(photo); await expect(d.getByText("Đang nén ảnh dưới 1 MB…")).toHaveCount(0); await d.getByRole("button",{ name:"Lưu nhật ký",exact:true }).click(); await expect(d).toHaveCount(0);
  await page.locator("section.journal-sync summary").click(); await page.getByRole("button",{ name:"So sánh hai bản",exact:true }).click(); await expect(page.locator(".journal-compare")).toContainText("Bản gửi đến có ảnh"); await page.getByRole("button",{ name:"Giữ bản máy chủ",exact:true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("pending-journals")).toHaveText("0 nhật ký chưa đồng bộ"); await expect(page.getByTestId("pending-photos")).toHaveText("0 ảnh đang chờ"); await page.locator("details.ops-notice>summary").click(); await expect(page.getByRole("link",{ name:"Tải bản gốc: site.jpg",exact:true })).toBeVisible();
  const archived=await page.evaluate(async () => { const p=(await globalThis.XdsJournalQueue.all("photos"))[0]; return { status:p.status,size:p.file.size,checksum:p.checksum }; }); expect(archived.status).toBe("archived"); expect(archived.size).toBeGreaterThan(0); expect(archived.checksum).toHaveLength(64);
  await page.getByRole("button",{ name:"Thử đồng bộ lại",exact:true }).click(); await page.reload(); await page.locator("details.ops-notice>summary").click(); await expect(page.getByRole("link",{ name:"Tải bản gốc: site.jpg",exact:true })).toBeVisible(); expect((await evidence(page,projectId)).photos).toBe(0);
  const history=await (await page.request.get(`/projects/${projectId}/journals/${journal.id}/history`)).json(); expect(history.conflicts[0].incoming_snapshot.pending_photos[0].filename).toBe("site.jpg"); expect(history.conflicts[0].chosen).toBe("server");
});

test("a conflict resolved by another engineer can be acknowledged locally and its selected photo uploads continue",async ({ page,browser }) => {
  const { projectId,workItemId }=await setup(page),base={ work_item_id:workItemId,client_uuid:crypto.randomUUID(),operation_uuid:crypto.randomUUID(),day:"2026-10-05",time:"08:30",content:"Gốc hai thiết bị",photo_ids:[],manpower:8,weather_code:"sunny",equipment_codes:[],daily_revision:0 };
  const j=(await (await page.request.post(`/projects/${projectId}/journals`,{ data:base })).json()).journal;
  await page.getByRole("button",{ name:"Tải lại",exact:true }).click(); await page.locator(".ops-journal-entry").getByRole("button",{ name:"Sửa",exact:true }).click(); const d=page.getByRole("dialog");
  await page.request.put(`/projects/${projectId}/journals/${j.id}`,{ data:{ ...base,revision:1,daily_revision:1,operation_uuid:crypto.randomUUID(),content:"A trên thiết bị khác" } });
  await d.getByLabel("Nội dung công việc").fill("B được người khác chọn"); await d.getByLabel("Chọn nhiều ảnh",{ exact:false }).setInputFiles(photo); await expect(d.getByText("Đang nén ảnh dưới 1 MB…")).toHaveCount(0); await d.getByRole("button",{ name:"Lưu nhật ký",exact:true }).click(); await expect(d).toHaveCount(0);
  await page.locator("section.journal-sync summary").click();
  const history=await (await page.request.get(`/projects/${projectId}/journals/${j.id}/history`)).json(),other=await browser.newContext({ baseURL:"http://127.0.0.1:4175" });
  try {
    await other.request.post("/auth/login",{ data:{ email:"project_manager@e2e.test",password:"Operations-only-E2E-123!" } });
    expect((await other.request.post(`/projects/${projectId}/journals/conflicts/${history.conflicts[0].id}/resolve`,{ data:{ chosen:"incoming",revision:history.journal.revision } })).status()).toBe(200);
  } finally { await other.close(); }
  await page.getByRole("button",{ name:"So sánh hai bản",exact:true }).click(); await page.getByRole("button",{ name:"Áp dụng lựa chọn đã xử lý",exact:true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("pending-journals")).toHaveText("0 nhật ký chưa đồng bộ"); await expect(page.getByTestId("pending-photos")).toHaveText("0 ảnh đang chờ"); expect((await evidence(page,projectId)).photos).toBe(1); await expect(page.locator(".ops-journal-entry")).toContainText("B được người khác chọn");
});
