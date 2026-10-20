import { expect, test } from "@playwright/test";

async function workspace(page, { route = "home", role = "admin", systemRole = "super_admin", logoutStatus = 200 } = {}) {
  const calls = [];
  await page.route("**/auth/me", r => r.fulfill({ json:{ user:{ id:1, fullname:"Kiểm thử đăng xuất", role, system_role:systemRole } } }));
  await page.route("**/auth/logout", r => { calls.push(r.request().method()); return r.fulfill({ status:logoutStatus, json:{ message:logoutStatus === 200 ? "Đăng xuất thành công" : "Không thể kết thúc phiên máy chủ" } }); });
  await page.route("**/projects", r => r.fulfill({ json:{ projects:[{ id:37, name:"Dự án kiểm thử", member_role:role }] } }));
  await page.route("**/projects/37/**", r => {
    const path = new URL(r.request().url()).pathname;
    const data = path.endsWith("/overview") ? { project:{ id:37, name:"Dự án kiểm thử", member_role:role, status:"active" } }
      : path.endsWith("/members") ? { project:{ id:37, name:"Dự án kiểm thử" }, members:[], invitations:[], roles:["engineer"], can_manage:false, current_user_id:1 }
      : { notifications:[], unread_count:0 };
    return r.fulfill({ json:data });
  });
  await page.goto(`/${route}?projectId=37`);
  await page.evaluate(async () => { await globalThis.XdsJournalQueue.identity(1); localStorage.setItem("user", JSON.stringify({ id:1 })); });
  return calls;
}
async function seed(page, photoOnly = false) {
  await page.evaluate(async ({ photoOnly }) => {
    const q = globalThis.XdsJournalQueue;
    await q.save({ key:"logout-draft", userId:1, projectId:37, createdAt:1, body:{ work_item_id:5, content:"Nhật ký cần giữ", client_uuid:crypto.randomUUID() }, photos:[{ clientUuid:crypto.randomUUID(), file:new File([new Uint8Array([0,1,2,128,255])], "offline.jpg", { type:"image/jpeg" }) }] });
    if (photoOnly) await new Promise((resolve, reject) => { const r=indexedDB.open("xds-journal",2); r.onsuccess=() => { const db=r.result, tx=db.transaction("queue","readwrite"); tx.objectStore("queue").delete("logout-draft"); tx.oncomplete=() => { db.close(); resolve(); }; tx.onerror=()=>reject(tx.error); }; });
    await q.put("cache", { key:"project:37:user:1", value:{ retained:true } });
    await (await caches.open("logout-shell-proof")).put("/public-shell", new Response("preserve shell"));
  }, { photoOnly });
}
const snapshot = page => page.evaluate(async () => ({ journals:await globalThis.XdsJournalQueue.all("queue"), photos:await Promise.all((await globalThis.XdsJournalQueue.all("photos")).map(async p => ({ key:p.key, userId:p.userId, projectId:p.projectId, bytes:[...new Uint8Array(await p.file.arrayBuffer())] }))), project:await globalThis.XdsJournalQueue.get("cache","project:37:user:1"), shell:await (await (await caches.open("logout-shell-proof")).match("/public-shell"))?.text() }));

for (const route of ["home", "members"]) test(`logout: ${route} footer remains reachable on desktop, Samsung and short landscape screens`, async ({ page }) => {
  const calls=await workspace(page,{ route });
  const sidebar=page.locator(".ops-shell-sidebar,.xds-members-sidebar");
  const nav=sidebar.locator("nav");
  const brand=sidebar.locator(":scope > a");
  const footer=sidebar.locator("footer.xds-sidebar-logout");
  const paths=["/home","/projects","/members","/work-items","/schedule","/calendar","/field-assignments","/site-journal","/acceptance","/payments","/costs-materials","/site-photos","/reports","/notifications","/audit-logs","/settings"];
  const expectedLinks=paths.map(path => `${path}?projectId=37`);
  if (route==="home") expectedLinks.unshift("/system-admin");
  await expect(nav.getByRole("link")).toHaveCount(expectedLinks.length);
  expect(await nav.getByRole("link").evaluateAll(links => links.map(link => link.getAttribute("href")))).toEqual(expectedLinks);
  await expect(brand).toContainText("XÂY DỰNG SỐ");
  await expect(sidebar.locator(".xds-members-sidebar-art,.ops-shell-picture")).toHaveCount(0);
  await expect(sidebar.getByText(/Kiến tạo công trình/)).toHaveCount(0);
  expect(await sidebar.evaluate(element => [...element.children].map(child => child.tagName))).toEqual(["A","NAV","FOOTER"]);
  for (const viewport of [{ width:1440,height:900 },{ width:1366,height:768 },{ width:1366,height:650 },{ width:411,height:808 },{ width:411,height:480 },{ width:915,height:411 },{ width:320,height:360 }]) {
    await page.setViewportSize(viewport);
    const menu=page.getByRole("button",{ name:"Mở menu",exact:true });
    if (await menu.isVisible()) await menu.click();
    const button=page.getByRole("button",{ name:"Đăng xuất",exact:true });
    await expect(button).toBeInViewport({ ratio:1 });
    await expect(button).toBeVisible();
    await button.click({ trial:true });
    await nav.evaluate(element => { element.scrollTop=0; });
    const brandBounds=await brand.boundingBox();
    const buttonBounds=await button.boundingBox();
    for (const link of await nav.getByRole("link").all()) {
      await link.scrollIntoViewIfNeeded();
      // Chromium rounds scroll offsets to pixels while row heights can be fractional.
      await expect(link).toBeInViewport({ ratio:0.99 });
      await link.click({ trial:true });
      await expect(button).toBeInViewport({ ratio:1 });
    }
    await nav.evaluate(element => { element.scrollTop=element.scrollHeight; });
    await expect(nav.getByRole("link").last()).toBeInViewport({ ratio:0.99 });
    const scroll=await nav.evaluate(element => ({ top:element.scrollTop,max:element.scrollHeight-element.clientHeight }));
    expect(Math.abs(scroll.top-scroll.max)).toBeLessThanOrEqual(1);
    if (viewport.height<=480) expect(scroll.max).toBeGreaterThan(0);
    expect(await sidebar.evaluate(element => element.scrollTop)).toBe(0);
    expect(await brand.boundingBox()).toEqual(brandBounds);
    expect(await button.boundingBox()).toEqual(buttonBounds);
    const navBounds=await nav.boundingBox(),footerBounds=await footer.boundingBox();
    expect(navBounds.y+navBounds.height).toBeLessThanOrEqual(footerBounds.y+1);
    expect(buttonBounds.y+buttonBounds.height).toBeLessThanOrEqual(viewport.height);
    expect(await button.evaluate(e => { const r=e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); })).toBe(true);
    await nav.evaluate(element => { element.scrollTop=0; });
    await expect(nav.getByRole("link").first()).toBeInViewport({ ratio:0.99 });
    expect(await brand.boundingBox()).toEqual(brandBounds);
    expect(await button.boundingBox()).toEqual(buttonBounds);
    if (viewport.width===1366&&viewport.height===768 || viewport.width===411&&viewport.height===808) {
      await test.info().attach(`${route}-${viewport.width}x${viewport.height}`,{ body:await page.screenshot(),contentType:"image/png" });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const closeMenu=page.getByRole("button",{ name:"Đóng menu",exact:true });
    if (await closeMenu.isVisible()) { await closeMenu.click(); await expect(closeMenu).not.toBeVisible(); }
  }
  await page.getByRole("button",{ name:"Mở menu",exact:true }).click();
  await page.getByRole("button",{ name:"Đăng xuất",exact:true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(calls).toEqual(["POST"]);
});

test("logout: empty queue ends the session through the existing API and redirects", async ({ page }) => {
  const calls=await workspace(page); await page.getByRole("button",{ name:"Đăng xuất",exact:true }).click();
  await expect(page).toHaveURL(/\/login$/); expect(calls).toEqual(["POST"]);
  expect(await page.evaluate(async () => ({ identity:await globalThis.XdsJournalQueue.get("control","identity"), remembered:await globalThis.XdsJournalQueue.get("cache","last-user"), user:localStorage.getItem("user") }))).toEqual({ identity:undefined, remembered:undefined, user:null });
});
test("logout: cancelling the pending-data warning leaves session, journal and image bytes unchanged", async ({ page }) => {
  const calls=await workspace(page); await seed(page); const before=await snapshot(page);
  page.once("dialog", async dialog => { expect(dialog.message()).toContain("chưa đồng bộ"); await dialog.dismiss(); });
  await page.getByRole("button",{ name:"Đăng xuất",exact:true }).click(); await expect(page.getByRole("button",{ name:"Đăng xuất",exact:true })).toBeEnabled();
  expect(calls).toEqual([]); expect(await snapshot(page)).toEqual(before);
  expect(await page.evaluate(async () => (await globalThis.XdsJournalQueue.get("control","identity")).userId)).toBe(1);
});
test("logout: confirming retains IndexedDB journals/photos and CacheStorage across redirect and reload", async ({ page }) => {
  const calls=await workspace(page); await seed(page); const before=await snapshot(page);
  page.once("dialog", dialog => dialog.accept()); await page.getByRole("button",{ name:"Đăng xuất",exact:true }).click(); await expect(page).toHaveURL(/\/login$/);
  expect(calls).toEqual(["POST"]); expect(await snapshot(page)).toEqual(before); await page.reload(); expect(await snapshot(page)).toEqual(before);
});
test("logout: photo-only pending uploads also require confirmation", async ({ page }) => {
  const calls=await workspace(page,{ route:"members" }); await seed(page,true); const before=await snapshot(page);
  expect(before.journals).toHaveLength(0); expect(before.photos).toHaveLength(1);
  page.once("dialog", dialog => dialog.dismiss()); await page.getByRole("button",{ name:"Đăng xuất",exact:true }).click(); await expect(page.getByRole("button",{ name:"Đăng xuất",exact:true })).toBeEnabled(); expect(calls).toEqual([]); expect(await snapshot(page)).toEqual(before);
});

test("logout: archived-only photos do not require confirmation and retain their original bytes", async ({ page }) => {
  const calls=await workspace(page); await seed(page,true);
  await page.evaluate(async () => { const q=globalThis.XdsJournalQueue; for (const photo of await q.all("photos")) await q.put("photos",{ ...photo,status:"archived" }); });
  const before=await snapshot(page),dialogs=[];
  page.on("dialog", dialog => { dialogs.push(dialog.message()); return dialog.dismiss(); });
  await page.getByRole("button",{ name:"Đăng xuất",exact:true }).click(); await expect(page).toHaveURL(/\/login$/);
  expect(dialogs).toEqual([]); expect(calls).toEqual(["POST"]); expect(await snapshot(page)).toEqual(before);
});
test("logout: server failure retains identity and all pending data without reporting success", async ({ page }) => {
  const calls=await workspace(page,{ logoutStatus:503 }); await seed(page); const before=await snapshot(page);
  page.once("dialog", dialog => dialog.accept()); await page.getByRole("button",{ name:"Đăng xuất",exact:true }).click(); await expect(page.getByRole("alert")).toContainText("Không thể kết thúc phiên");
  expect(calls).toEqual(["POST"]); expect(await snapshot(page)).toEqual(before); expect(await page.evaluate(async () => (await globalThis.XdsJournalQueue.get("control","identity")).userId)).toBe(1);
  expect(await page.evaluate(() => globalThis.XdsJournalQueue.get("control","logout"))).toBeUndefined();
});

test("logout: inability to persist the logout guard leaves the server session untouched", async ({ page }) => {
  const calls=await workspace(page);
  await page.evaluate(() => { globalThis.XdsJournalQueue.beginLogout=async () => { throw new Error("Không thể lưu trạng thái đăng xuất"); }; });
  await page.getByRole("button",{ name:"Đăng xuất",exact:true }).click();
  await expect(page.getByRole("alert")).toContainText("Không thể lưu trạng thái đăng xuất");
  expect(calls).toEqual([]); expect(await page.evaluate(async () => (await globalThis.XdsJournalQueue.get("control","identity")).userId)).toBe(1);
});

for (const failure of ["identity","metadata"]) test(`logout: ${failure} cleanup failure still redirects and blocks retained offline journals across reload`, async ({ page }) => {
  const calls=await workspace(page); await seed(page); const before=await snapshot(page);
  await page.evaluate(({ failure }) => {
    if (failure==="identity") {
      const original=globalThis.XdsJournalQueue.identity;
      globalThis.XdsJournalQueue.identity=(uid,...options) => { if (uid==null) throw new Error("IndexedDB cleanup unavailable"); return original(uid,...options); };
    } else {
      const original=Storage.prototype.removeItem;
      Storage.prototype.removeItem=function(key) { if (key==="user") throw new Error("Local metadata unavailable"); return original.call(this,key); };
    }
  },{ failure });
  page.once("dialog", dialog => dialog.accept()); await page.getByRole("button",{ name:"Đăng xuất",exact:true }).click();
  await expect(page).toHaveURL(/\/login$/); expect(calls).toEqual(["POST"]); expect(await snapshot(page)).toEqual(before);
  expect(await page.evaluate(() => globalThis.XdsJournalQueue.get("control","logout"))).toBeTruthy();
  expect(await page.evaluate(async () => (await globalThis.XdsJournalQueue.get("control","identity"))?.userId)).toBe(failure==="identity" ? 1 : undefined);
  await page.goto("/site-journal?projectId=37"); await expect(page.getByRole("alert")).toContainText("Phiên đã đăng xuất");
  await page.reload(); await expect(page.getByRole("alert")).toContainText("Phiên đã đăng xuất");
  expect(await page.evaluate(() => globalThis.XdsJournalQueue.sync(37,1))).toEqual({ saved:0 });
  expect(await snapshot(page)).toEqual(before);
});

test("logout: guard cancellation preserves other attempts and completed logout blocks implicit identity recovery", async ({ page }) => {
  await workspace(page);
  const state=await page.evaluate(async () => {
    const q=globalThis.XdsJournalQueue,first=await q.beginLogout(),second=await q.beginLogout();
    await q.cancelLogout(first); const remaining=await q.get("control","logout");
    await q.cancelLogout(second); const cancelled=await q.get("control","logout");
    await q.identity(null); const completed=await q.get("control","logout"),retry=await q.beginLogout();
    await q.cancelLogout(retry);
    const restored=await q.identity(1,{ expectedGeneration:undefined });
    return { remaining:remaining.tokens,cancelled,second,completed:completed.completed,after:await q.get("control","logout"),restored,identity:await q.get("control","identity") };
  });
  expect(state.remaining).toEqual([state.second]); expect(state.cancelled).toBeUndefined();
  expect(state.completed).toBe(true); expect(state.after.completed).toBe(true); expect(state.restored).toBe(false); expect(state.identity).toBeUndefined();
});

test("logout: explicit login clears the guard while another account cannot consume retained drafts", async ({ page }) => {
  await workspace(page); await seed(page); const before=await snapshot(page);
  page.once("dialog", dialog => dialog.accept()); await page.getByRole("button",{ name:"Đăng xuất",exact:true }).click(); await expect(page).toHaveURL(/\/login$/);
  await page.route("**/auth/login", r => r.fulfill({ json:{ user:{ id:2,fullname:"Tài khoản khác" } } }));
  await page.getByLabel("Email",{ exact:true }).fill("other@example.test"); await page.getByLabel("Mật khẩu",{ exact:true }).fill("test-password");
  await page.getByRole("button",{ name:"Đăng nhập",exact:true }).click(); await expect(page).toHaveURL(/\/home$/);
  expect(await page.evaluate(async () => {
    const q=globalThis.XdsJournalQueue;
    return { guard:await q.get("control","logout"),user:(await q.get("control","identity")).userId,other:await q.pending(37,2),retained:(await q.pending(37,1)).length,sync:await q.sync(37,1) };
  })).toEqual({ guard:undefined,user:2,other:[],retained:1,sync:{ saved:0 } });
  expect(await snapshot(page)).toEqual(before);
});
test("logout: project denial invalidates identity without locking authorized projects or changing retained drafts", async ({ page }) => {
  await workspace(page); await seed(page); const before=await snapshot(page);
  await page.route("**/projects/37/journals", r => r.fulfill({ status:403,json:{ message:"Không có quyền xem nhật ký dự án này" } }));
  await page.route("**/projects/38/journals", r => r.fulfill({ json:{ journals:[],catalog:[] } }));
  const state=await page.evaluate(async () => {
    const { loadJournals }=await import("/src/services/journalOffline.js");
    const q=globalThis.XdsJournalQueue,original=await q.get("control","identity");
    let deniedStatus;
    try { await loadJournals(37); } catch (error) { deniedStatus=error.status; }
    const denied={ status:deniedStatus,identity:await q.get("control","identity"),remembered:await q.get("cache","last-user"),guard:await q.get("control","logout") };
    const loaded=await loadJournals(38),identity=await q.get("control","identity");
    return { denied,authorized:{ user:loaded.user.id,offline:loaded.offline,identity:identity.userId,newGeneration:identity.generation!==original.generation,guard:await q.get("control","logout") } };
  });
  expect(state.denied).toEqual({ status:403,identity:undefined,remembered:undefined,guard:undefined });
  expect(state.authorized).toEqual({ user:1,offline:false,identity:1,newGeneration:true,guard:undefined });
  expect(await snapshot(page)).toEqual(before);
});

test("logout: unreadable offline storage and an unsaved journal form fail closed", async ({ page }) => {
  const calls=await workspace(page); await page.evaluate(() => { globalThis.xdsJournalEditing=true; });
  await page.getByRole("button",{ name:"Đăng xuất",exact:true }).click(); await expect(page.getByRole("alert")).toContainText("lưu hoặc đóng"); expect(calls).toEqual([]);
  await page.evaluate(() => { globalThis.xdsJournalEditing=false; globalThis.XdsJournalQueue.all=async () => { throw new Error("Không thể đọc bộ nhớ offline"); }; });
  await page.getByRole("button",{ name:"Đăng xuất",exact:true }).click(); await expect(page.getByRole("alert")).toContainText("Không thể đọc bộ nhớ"); expect(calls).toEqual([]);
});
test("logout: footer is available without changing the role-filtered project menu", async ({ page }) => {
  for (const role of ["admin","project_manager","engineer","worker","accountant","viewer"]) {
    await page.unrouteAll({ behavior:"wait" }); await workspace(page,{ role,systemRole:"user" });
    await expect(page.getByRole("button",{ name:"Đăng xuất",exact:true })).toBeVisible();
    const nav=page.getByRole("navigation"); await expect(nav.getByRole("link",{ name:"Cài đặt",exact:true })).toBeVisible();
    expect(await nav.getByRole("link",{ name:"Thanh toán",exact:true }).count()).toBe(["admin","project_manager","accountant","viewer"].includes(role) ? 1 : 0);
    expect(await nav.getByRole("link",{ name:"Nhật ký công trường",exact:true }).count()).toBe(role === "worker" || role === "accountant" ? 0 : 1);
    expect(await nav.getByRole("link",{ name:"Quản trị hệ thống",exact:true }).count()).toBe(0);
  }
});
