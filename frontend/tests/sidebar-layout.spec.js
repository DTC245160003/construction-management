import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ID = 37;
const MEMBER_PATH = `/members?projectId=${PROJECT_ID}`;
const pages = [
  ["/home", "Tổng quan", "overview"],
  ["/projects", "Dự án", "projects"],
  ["/members", "Thành viên & phân quyền", "members"],
  ["/work-items", "Cây hạng mục", "items"],
  ["/schedule", "Tiến độ & đường găng", "schedule"],
  ["/calendar", "Lịch làm việc", "calendar"],
  ["/field-assignments", "Giao việc hiện trường", "assignments"],
  ["/site-journal", "Nhật ký công trường", "journals"],
  ["/acceptance", "Nghiệm thu khối lượng", "acceptance"],
  ["/payments", "Thanh toán", "payments"],
  ["/costs-materials", "Chi phí & vật tư", "costs"],
  ["/site-photos", "Ảnh hiện trường", "photos"],
  ["/reports", "Báo cáo", "reports"],
  ["/notifications", "Thông báo", "notifications"],
  ["/audit-logs", "Nhật ký hệ thống", "audit-logs"],
  ["/settings", "Cài đặt", "settings"],
  ["/system-admin", "Quản trị hệ thống", "admin/users"],
];
const projectPaths = pages.slice(0, 16).map(([path]) => path);
const rolePaths = {
  admin: projectPaths, manager: projectPaths, project_manager: projectPaths,
  engineer: ["/home", "/projects", "/members", "/work-items", "/schedule", "/calendar", "/field-assignments", "/site-journal", "/acceptance", "/site-photos", "/notifications", "/settings"],
  worker: ["/home", "/projects", "/field-assignments", "/site-photos", "/notifications", "/settings"],
  accountant: ["/home", "/projects", "/members", "/calendar", "/payments", "/costs-materials", "/site-photos", "/reports", "/notifications", "/settings"],
  viewer: projectPaths.filter(path => path !== "/audit-logs"),
};
const profilePaths = (role, systemRole) => systemRole === "super_admin" ? ["/system-admin", ...projectPaths] : rolePaths[role];
const scoped = (path, projectId = PROJECT_ID) => path === "/system-admin" || !projectId ? path : `${path}?projectId=${projectId}`;
const sidebar = page => page.locator(".ops-shell-sidebar,.xds-members-sidebar");

function fixture(role, systemRole) {
  const project = { id: PROJECT_ID, name: "Dự án kiểm tra sidebar", location: "Công trường local", start_date: "2026-10-01", status: "active", member_role: role, member_count: 1 };
  const user = { id: 1, fullname: "Người kiểm tra giao diện", email: "sidebar@local.test", role, system_role: systemRole };
  const item = { id: 10, title: "Hạng mục kiểm tra sidebar", parent_id: null, is_leaf: true, status: "doing" };
  const task = { id: 20, name: "Công việc kiểm tra sidebar", work_item_id: 10, work_item_name: item.title, duration_days: 2, duration: 2, es: 0, ef: 2, ls: 0, lf: 2, slack: 0, isCritical: true, newlyCritical: false, plannedEf: 2, progress_percent: 0, status: "in_progress", start_date: "2026-10-01", finish_date: "2026-10-02", complete: false, is_late: false, team_id: null, open_issues: 0 };
  const manage = ["admin", "manager", "project_manager"].includes(role);
  const member = { ...user, status: "active", created_at: "2026-10-01T00:00:00.000Z", last_login_at: null, team: "" };
  const journal = { id: 30, day: "2026-10-01", time: "08:00", work_item_id: 10, item_name: item.title, content: "Nhật ký kiểm tra sidebar", author_id: 1, author: user.fullname, manpower: 5, weather: "Nắng", equipment: "", photo_ids: [], revision: 1, locked: true };
  const data = {
    overview: { project },
    members: { project, members: [member], invitations: [], roles: Object.keys(rolePaths), can_manage: manage, current_user_id: 1 },
    items: { items: [item] }, tasks: { tasks: [task] }, dependencies: { dependencies: [] },
    schedule: { schedule: [task], summary: { plannedFinish: 2, currentFinish: 2, delayDays: 0 } },
    "work-item-milestones": { milestones: [] }, "milestone-alerts": { alerts: [] },
    "baselines/history": { history: [] },
    calendar: { calendar: { working_days: [1, 2, 3, 4, 5, 6], revision: 1 }, holidays: [] },
    assignments: { project, tasks: [task], teams: [], can_manage: manage, member_role: role },
    participants: { participants: [member] },
    journals: { project, journals: [journal], items: [item], catalog: [], member_role: role },
    "journals/daily": { daily: null, lock: null }, "journals/days": { days: [], tasks: [] },
    acceptance: { forms: [], contracts: [], items: [item], contract_rollup: [], member_role: role, can_edit: manage || role === "engineer", can_adjust: manage, can_approve: manage || role === "viewer" },
    payments: { requests: [], acceptances: [], contract_terms: { retention_rate: "5", revision: 1 }, retention_summary: { gross: "0.00", retained: "0.00", net: "0.00" }, member_role: role, can_manage_terms: manage, can_edit: manage || role === "accountant", can_approve: manage || role === "viewer" },
    costs: { items: [item], budgets: [], costs: [], comparison: [], materials: [], inventory: [], norms: [], reconciliation: [], can_manage_budget: manage, can_edit: manage || role === "accountant" },
    photos: { photos: [], member_role: role }, lookup: { items: [item], member_role: role },
    reports: { project, tasks: [task], milestones: [], progress: null, baseline_finish: null, items: [item], contracts: [], acceptances: [], payments: [], costs: [], budgets: [], schedule_milestone_alerts: [], can_manage: manage },
    notifications: { notifications: [], unread_count: 0 }, "audit-logs": { entries: [] },
    settings: { project, site: null, preferences: [], can_manage: manage, email_configured: false },
  };
  return { project, user, data };
}

async function installMocks(page, context, { role = "admin", systemRole = "user" } = {}) {
  const state = { requests: [], unexpected: [], writes: [], pageErrors: [], geometry: [] };
  const f = fixture(role, systemRole);
  page.on("pageerror", error => state.pageErrors.push(error.message));
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const isApi = request.resourceType() !== "document" && /^\/(?:auth|projects|admin)(?:\/|$)/.test(url.pathname);
    if (!isApi) return route.continue();
    const call = { method: request.method(), path: url.pathname, query: url.search };
    state.requests.push(call);
    if (request.method() !== "GET") {
      state.writes.push(call);
      return route.fulfill({ status: 405, json: { message: "UI geometry probe blocks mutations" } });
    }
    if (url.pathname === "/auth/me") return route.fulfill({ json: { user: f.user } });
    if (url.pathname === "/projects") return route.fulfill({ json: { projects: [f.project], can_create: systemRole === "super_admin" } });
    if (url.pathname === "/admin/users") return route.fulfill({ status: systemRole === "super_admin" ? 200 : 403, json: systemRole === "super_admin" ? { users: [{ ...f.user, is_active: true, status: "active", projects: [{ id: PROJECT_ID, name: f.project.name, role }] }] } : { message: "Không có quyền quản trị hệ thống" } });
    if (url.pathname === "/admin/audit-logs") return route.fulfill({ json: { entries: [] } });
    const match = url.pathname.match(/^\/projects\/37\/(.+)$/);
    if (match && Object.hasOwn(f.data, match[1])) {
      return route.fulfill({ json: f.data[match[1]] });
    }
    state.unexpected.push(call);
    return route.fulfill({ status: 501, json: { message: `Missing sidebar fixture: ${url.pathname}` } });
  });
  return state;
}

async function openSidebar(page) {
  const toggle = page.getByRole("button", { name: "Mở menu", exact: true });
  if (await toggle.isVisible()) {
    const box = await sidebar(page).boundingBox();
    if (!box || box.x < -1 || !(await sidebar(page).isVisible())) await toggle.click();
  }
  await expect(sidebar(page)).toBeVisible();
  await expect.poll(async () => Math.round((await sidebar(page).boundingBox())?.x ?? -1000)).toBe(0);
}

async function assertLayout(page, state, label, expectedPaths, projectId = PROJECT_ID) {
  await openSidebar(page);
  const aside = sidebar(page);
  const brand = aside.locator(":scope > a");
  const nav = aside.locator(":scope > nav");
  const footer = aside.locator(":scope > footer.xds-sidebar-logout");
  const button = footer.getByRole("button", { name: "Đăng xuất", exact: true });
  const expectedLinks = expectedPaths.map(path => scoped(path, projectId));
  await expect(nav.getByRole("link")).toHaveCount(expectedLinks.length);
  expect(await nav.getByRole("link").evaluateAll(links => links.map(link => link.getAttribute("href")))).toEqual(expectedLinks);
  await expect(brand).toContainText("XÂY DỰNG SỐ");
  await expect(brand.locator("svg,.ops-shell-mark,.xds-members-logo").first()).toBeVisible();
  await expect(aside.locator(".ops-shell-picture,.xds-members-sidebar-art")).toHaveCount(0);
  await expect(aside.getByText(/Kiến tạo công trình|Vững bước tương lai/i)).toHaveCount(0);
  expect(await aside.evaluate(element => [...element.children].map(child => child.tagName))).toEqual(["A", "NAV", "FOOTER"]);

  await nav.evaluate(element => { element.scrollTop = 0; });
  const before = await aside.evaluate(element => {
    const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right }; };
    const [brand, nav, footer] = element.children;
    const body = document.querySelector(".ops-shell-body,.xds-members-main");
    return { aside: rect(element), brand: rect(brand), nav: rect(nav), footer: rect(footer), body: body ? rect(body) : null, height: innerHeight, sidebarScrollTop: element.scrollTop, sidebarScrollMax: element.scrollHeight - element.clientHeight, navScrollMax: nav.scrollHeight - nav.clientHeight, directChildren: element.children.length, background: getComputedStyle(element).background };
  });
  expect(Math.abs(before.aside.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(before.aside.height - before.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(before.brand.y - before.aside.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(before.nav.y - before.brand.bottom)).toBeLessThanOrEqual(1);
  expect(Math.abs(before.nav.bottom - before.footer.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(before.footer.bottom - before.height)).toBeLessThanOrEqual(1);
  expect(before.sidebarScrollTop).toBe(0);
  expect(before.sidebarScrollMax).toBeLessThanOrEqual(1);
  if (!(await page.getByRole("button", { name: "Mở menu", exact: true }).isVisible())) expect(before.body.x).toBeGreaterThanOrEqual(before.aside.right - 1);

  for (const link of [nav.getByRole("link").first(), nav.getByRole("link").last()]) {
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeInViewport({ ratio: 0.99 });
    await link.click({ trial: true });
    await expect(button).toBeInViewport({ ratio: 1 });
    await button.click({ trial: true });
  }
  await nav.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const after = await aside.evaluate(element => {
    const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right }; };
    const nav = element.querySelector("nav");
    const button = element.querySelector(".xds-sidebar-logout-button");
    const r = button.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { brand: rect(element.children[0]), footer: rect(element.children[2]), sidebarScrollTop: element.scrollTop, navTop: nav.scrollTop, navMax: nav.scrollHeight - nav.clientHeight, buttonHit: Boolean(hit && button.contains(hit)) };
  });
  expect(Math.abs(after.navTop - after.navMax)).toBeLessThanOrEqual(1);
  expect(after.sidebarScrollTop).toBe(0);
  expect(after.brand).toEqual(before.brand);
  expect(after.footer).toEqual(before.footer);
  expect(after.buttonHit).toBe(true);
  state.geometry.push({ label, route: new URL(page.url()).pathname, viewport: page.viewportSize(), expectedLinks, before, after });
}

async function ready(page, path, state) {
  const definition = pages.find(([route]) => route === path);
  await expect(page.getByRole("heading", { name: definition[1], exact: true }).first()).toBeVisible();
  const endpoint = definition[2] === "projects" ? "/projects" : definition[2] === "admin/users" ? "/admin/users" : `/projects/${PROJECT_ID}/${definition[2]}`;
  await expect.poll(() => state.requests.some(request => request.path === endpoint)).toBe(true);
  {
    const content = {
      "/home": () => page.getByRole("heading", { name: "Dự án kiểm tra sidebar", exact: true }),
      "/projects": () => page.locator(".ops-project-card").first(),
      "/members": () => page.getByRole("row").filter({ hasText: "sidebar@local.test" }),
      "/work-items": () => page.getByText("Hạng mục kiểm tra sidebar", { exact: true }).first(),
      "/schedule": () => page.locator(".schedule-board"),
      "/calendar": () => page.locator(".calendar-month-grid"),
      "/field-assignments": () => page.getByRole("heading", { name: "Danh sách công việc (1)", exact: true }),
      "/site-journal": () => page.getByText("Nhật ký kiểm tra sidebar", { exact: true }),
      "/acceptance": () => page.getByRole("heading", { name: "Hồ sơ nghiệm thu", exact: true }),
      "/payments": () => page.getByRole("heading", { name: "Đề nghị thanh toán", exact: true }),
      "/costs-materials": () => page.getByRole("heading", { name: "Dự toán và thực chi theo hạng mục", exact: true }),
      "/site-photos": () => page.getByRole("heading", { name: "Thư viện ảnh (0)", exact: true }),
      "/reports": () => page.getByRole("heading", { name: "Mốc kiểm soát tiến độ", exact: true }),
      "/notifications": () => page.getByRole("heading", { name: /Hộp thông báo/ }),
      "/audit-logs": () => page.getByRole("heading", { name: "Nhật ký thao tác", exact: true }),
      "/settings": () => page.locator("#settings-project"),
      "/system-admin": () => page.getByRole("row").filter({ hasText: "sidebar@local.test" }),
    };
    await expect(content[path]()).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  expect(state.pageErrors).toEqual([]);
  expect(state.unexpected).toEqual([]);
  expect(state.writes).toEqual([]);
}

async function clickNav(page, path, projectId = PROJECT_ID) {
  await openSidebar(page);
  await sidebar(page).locator(`nav a[href="${scoped(path, projectId)}"]`).click();
}

async function attach(testInfo, state, details) {
  await testInfo.attach("sidebar-route-result", { body: Buffer.from(JSON.stringify({ ...details, status: testInfo.status, ...state }, null, 2)), contentType: "application/json" });
}

for (const [path] of pages) test(`sidebar route ${path}: Members round trip preserves fixed brand and logout`, async ({ page, context }, testInfo) => {
  const systemRole = path === "/system-admin" ? "super_admin" : "user";
  const state = await installMocks(page, context, { systemRole });
  try {
    await page.goto(MEMBER_PATH);
    await ready(page, "/members", state);
    await assertLayout(page, state, "before", projectPaths);
    if (path === "/system-admin") {
      await clickNav(page, "/home");
      await ready(page, "/home", state);
    }
    await clickNav(page, path);
    await ready(page, path, state);
    await assertLayout(page, state, "destination", path === "/members" ? projectPaths : profilePaths("admin", systemRole), path === "/system-admin" ? null : PROJECT_ID);
    if (path === "/system-admin") {
      // The global system page has no selected project; use its real membership link.
      const closeMenu = page.getByRole("button", { name: "Đóng menu", exact: true });
      if (await closeMenu.isVisible()) await closeMenu.click();
      await page.locator(`.system-membership a[href="${MEMBER_PATH}"]`).click();
    } else await clickNav(page, "/members");
    await ready(page, "/members", state);
    await assertLayout(page, state, "returned", projectPaths);
    expect(state.writes).toEqual([]);
  } finally { await attach(testInfo, state, { kind: "page-round-trip", path, projectRole: "admin", systemRole }); }
});

for (const role of [...Object.keys(rolePaths), "super_admin"]) test(`sidebar role ${role}: Members navigation leaves current project permissions unchanged`, async ({ page, context }, testInfo) => {
  const projectRole = role === "super_admin" ? "admin" : role;
  const systemRole = role === "super_admin" ? "super_admin" : "user";
  const state = await installMocks(page, context, { role: projectRole, systemRole });
  try {
    await page.goto(MEMBER_PATH);
    await ready(page, "/members", state);
    await assertLayout(page, state, "members-current-static-menu", projectPaths);
    await clickNav(page, "/home");
    await ready(page, "/home", state);
    await assertLayout(page, state, "home-role-menu", profilePaths(projectRole, systemRole));
    // Workers have no Members link in the current Dashboard role policy.
    if (role === "worker") await page.goBack();
    else await clickNav(page, "/members");
    await ready(page, "/members", state);
    await assertLayout(page, state, "members-returned-current-static-menu", projectPaths);
  } finally { await attach(testInfo, state, { kind: "role-policy", projectRole, systemRole }); }
});

test.describe("PWA service worker", () => {
  test.use({ serviceWorkers: "allow" });
  test("sidebar PWA: controlled production shell keeps all operational routes and return navigation", async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-411x808", "One isolated mobile PWA context; desktop/landscape production routes have separate cases.");
    const state = await installMocks(page, context, { systemRole: "super_admin" });
    try {
      await page.goto(MEMBER_PATH);
      await ready(page, "/members", state);
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
      });
      expect(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL)).toMatch(/\/journal-sw\.js$/);
      for (const [path] of pages.filter(([path]) => path !== "/system-admin")) {
        await clickNav(page, path);
        await ready(page, path, state);
        await assertLayout(page, state, `PWA:${path}`, path === "/members" ? projectPaths : profilePaths("admin", "super_admin"));
        await clickNav(page, "/members");
        await ready(page, "/members", state);
      }
      const cachedPaths = await page.evaluate(async () => {
        const result = [];
        for (const key of await caches.keys()) for (const request of await (await caches.open(key)).keys()) result.push(new URL(request.url).pathname);
        return result;
      });
      expect(cachedPaths).toContain("/");
      expect(cachedPaths.some(path => /^\/(?:auth|projects|admin)(?:\/|$)/.test(path))).toBe(false);
      await testInfo.attach("pwa-controlled-shell", { body: Buffer.from(JSON.stringify({ controller: await page.evaluate(() => navigator.serviceWorker.controller.scriptURL), cachedPaths, limitation: "Browser-emulated mobile production PWA; not a physical Samsung or OS-installed standalone verification." }, null, 2)), contentType: "application/json" });
    } finally { await attach(testInfo, state, { kind: "production-pwa", projectRole: "admin", systemRole: "super_admin" }); }
  });

  test("sidebar PWA upgrade: existing cached banner is replaced and offline journal/photo bytes remain", async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-411x808", "One disposable mobile origin tests the actual existing-worker update flow.");
    const workspace = fileURLToPath(new URL("../../", import.meta.url));
    const oldDirectory = path.resolve(workspace, ".tmp/logout-resume-build");
    const newDirectory = path.resolve(workspace, ".tmp/sidebar-complete-build");
    let activeDirectory = oldDirectory;
    const serverRequests = [];
    const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
    // Static files only. No proxy, DB, production port or persistent user profile.
    const server = createServer(async (request, response) => {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      serverRequests.push({ method: request.method, path: pathname });
      if (request.method !== "GET" || (/^\/(?:auth|admin|projects)(?:\/|$)/.test(pathname) && !request.headers.accept?.includes("text/html"))) {
        response.writeHead(405, { "Content-Type": "application/json" });
        response.end('{"message":"Static upgrade fixture blocks API requests"}');
        return;
      }
      const target = !path.extname(pathname) ? "/index.html" : pathname;
      for (const directory of [activeDirectory, oldDirectory]) {
        const filename = path.resolve(directory, `.${target}`);
        if (path.relative(directory, filename).startsWith("..")) continue;
        try {
          if (!(await stat(filename)).isFile()) continue;
          const bytes = await readFile(filename);
          response.writeHead(200, { "Content-Type": mime[path.extname(filename)] || "application/octet-stream", "Cache-Control": "no-store", ...(pathname === "/journal-sw.js" ? { "Service-Worker-Allowed": "/" } : {}) });
          response.end(bytes);
          return;
        } catch { /* New bundle may still request an old hashed asset during upgrade. */ }
      }
      response.writeHead(404);
      response.end("Missing static upgrade fixture");
    });
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const state = await installMocks(page, context);
    const offlineSnapshot = () => page.evaluate(async () => {
      const q = globalThis.XdsJournalQueue;
      return {
        journals: await q.all("queue"),
        photos: await Promise.all((await q.all("photos")).map(async photo => ({ ...photo, file: { name: photo.file.name, type: photo.file.type, bytes: [...new Uint8Array(await photo.file.arrayBuffer())] } }))),
      };
    });
    try {
      await page.goto(`${origin}/home?projectId=${PROJECT_ID}`);
      await ready(page, "/home", state);
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
      });
      const oldEntry = await page.locator('script[type="module"]').getAttribute("src");
      const oldCaches = await page.evaluate(() => caches.keys());
      await clickNav(page, "/members");
      await ready(page, "/members", state);
      await expect(sidebar(page).locator(".xds-members-sidebar-art")).toHaveCount(1);
      await page.evaluate(async () => {
        const q = globalThis.XdsJournalQueue;
        await q.identity(1);
        await q.save({ key: "sidebar-upgrade-offline-draft", userId: 1, projectId: 37, createdAt: 1, body: { work_item_id: 10, content: "Nhật ký offline phải giữ khi cập nhật", day: "2026-10-01", time: "08:00", client_uuid: "868ff000-5146-4140-a38e-8e2fe12d4bdd" }, photos: [{ clientUuid: "4461f3ba-7215-4a7f-ab9d-e9c97ad409d1", file: new File([new Uint8Array([0, 1, 2, 128, 255])], "sidebar-offline.jpg", { type: "image/jpeg" }) }] });
        // Existing failed jobs are durable, and ineligible for automatic retry.
        // This protects the evidence fixture from unrelated Background Sync.
        for (const store of ["queue", "photos"]) for (const entry of await q.all(store)) await q.put(store, { ...entry, status: "error", attempts: 5, error: "Isolated upgrade fixture; no sync" });
      });
      const before = await offlineSnapshot();
      activeDirectory = newDirectory;
      await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
      await clickNav(page, "/home");
      await ready(page, "/home", state);
      const update = page.getByRole("button", { name: "Cập nhật ứng dụng", exact: true });
      await expect(update).toBeVisible({ timeout: 30000 });
      await Promise.all([page.waitForEvent("load"), update.click()]);
      await ready(page, "/home", state);
      await expect.poll(() => page.locator('script[type="module"]').getAttribute("src")).not.toBe(oldEntry);
      await clickNav(page, "/members");
      await ready(page, "/members", state);
      await assertLayout(page, state, "upgraded-existing-PWA-members", projectPaths);
      expect(await offlineSnapshot()).toEqual(before);
      const newCaches = await page.evaluate(() => caches.keys());
      expect(newCaches.filter(key => key.startsWith("xds-journal-shell-"))).toHaveLength(1);
      expect(newCaches.filter(key => key.startsWith("xds-journal-shell-"))).not.toEqual(oldCaches.filter(key => key.startsWith("xds-journal-shell-")));
      expect(state.writes).toEqual([]);
      expect(state.pageErrors).toEqual([]);
      await testInfo.attach("existing-PWA-upgrade", { body: Buffer.from(JSON.stringify({ origin, oldEntry, newEntry: await page.locator('script[type="module"]').getAttribute("src"), oldCaches, newCaches, before, after: await offlineSnapshot(), serverRequests, result: "Existing cached banner replaced through the real update button; retained offline journal and original photo bytes match exactly." }, null, 2)), contentType: "application/json" });
    } finally {
      await attach(testInfo, state, { kind: "existing-pwa-upgrade", projectRole: "admin", systemRole: "user" });
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });
});
