import { expect, test } from "@playwright/test";
import process from "node:process";

// Run against scripts/operations-e2e-server.cjs with API_PROXY_TARGET=:3031.
// These flows use real HTTP, sessions, authorization, migrations and PostgreSQL.
test.skip(!process.env.OPERATIONS_REAL_E2E, "Requires the isolated PostgreSQL E2E server");
async function login(page, role = "admin") {
  const response = await page.request.post("/auth/login", { data: { email: `${role}@e2e.test`, password: "Operations-only-E2E-123!" } });
  expect(response.status()).toBe(200);
}
async function fixture(page) { return (await page.request.get("http://127.0.0.1:3031/__fixture")).json(); }

test("logout: real mobile login, session invalidation, queued photo preservation and next-account RBAC", async ({ page, context }) => {
  const { projectId, workItemId } = await fixture(page);
  await page.setViewportSize({ width:411, height:808 });
  const uiLogin=async role => {
    await page.goto("/login"); await page.locator("#xds-identifier").fill(`${role}@e2e.test`); await page.locator("#xds-password").fill("Operations-only-E2E-123!");
    await page.getByRole("button",{ name:"Đăng nhập",exact:true }).click(); await expect(page).toHaveURL(/\/home$/);
  };
  await uiLogin("engineer");
  const engineer=(await (await page.request.get("/auth/me")).json()).user;
  await page.goto(`/home?projectId=${projectId}`);
  await page.getByRole("button",{ name:"Mở menu",exact:true }).click();
  await expect(page.getByRole("navigation").getByRole("link",{ name:"Nhật ký công trường",exact:true })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link",{ name:"Thanh toán",exact:true })).toHaveCount(0);
  await page.evaluate(async ({ userId, projectId, workItemId }) => {
    await globalThis.XdsJournalQueue.save({ key:"real-logout-draft",userId,projectId,createdAt:1,body:{ work_item_id:workItemId,client_uuid:crypto.randomUUID(),content:"Desktop-isolated logout draft" },photos:[{ clientUuid:crypto.randomUUID(),file:new File([new Uint8Array([3,7,128,255])],"retained.jpg",{type:"image/jpeg"}) }] });
  },{ userId:engineer.id,projectId,workItemId });
  const retained=()=>page.evaluate(async()=>({ journals:await globalThis.XdsJournalQueue.all("queue"),photos:await Promise.all((await globalThis.XdsJournalQueue.all("photos")).map(async p=>({ key:p.key,userId:p.userId,bytes:[...new Uint8Array(await p.file.arrayBuffer())] }))) }));
  const before=await retained(),cookie=(await context.cookies()).find(c=>c.name==="construction.sid"); expect(cookie).toBeTruthy();
  await page.screenshot({ path:test.info().outputPath("logout-samsung-viewport.png") });
  page.once("dialog",dialog=>dialog.accept()); await page.getByRole("button",{ name:"Đăng xuất",exact:true }).click(); await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/auth/me")).status()).toBe(401);
  expect((await page.request.get("/auth/me",{ headers:{ Cookie:`${cookie.name}=${cookie.value}` } })).status()).toBe(401);
  expect(await retained()).toEqual(before);
  await page.goBack();
  await expect(page.getByText(engineer.fullname,{ exact:true })).toHaveCount(0);
  await expect(page.getByRole("navigation").getByRole("link",{ name:"Nhật ký công trường",exact:true })).toHaveCount(0);
  expect((await page.request.get("/auth/me")).status()).toBe(401);
  await page.goto("/login"); await page.reload(); expect(await retained()).toEqual(before);
  await uiLogin("worker"); const worker=(await (await page.request.get("/auth/me")).json()).user; expect(worker.id).not.toBe(engineer.id);
  await page.goto(`/home?projectId=${projectId}`); await page.getByRole("button",{ name:"Mở menu",exact:true }).click();
  await expect(page.getByRole("navigation").getByRole("link",{ name:"Giao việc hiện trường",exact:true })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link",{ name:"Nhật ký công trường",exact:true })).toHaveCount(0);
  expect((await page.request.post(`/projects/${projectId}/journals`,{ data:{} })).status()).toBe(403);
  expect((await page.request.get("/admin/users")).status()).toBe(403);
  expect(await retained()).toEqual(before);
});

test("real project creation, persistence, calendar editing and project navigation", async ({ page }) => {
  const createdName = `Công trình kiểm thử mới ${Date.now()}`;
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Dự án", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tạo dự án", exact: false }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tên dự án").fill(createdName);
  await dialog.getByLabel("Địa điểm").fill("TP. Hồ Chí Minh");
  await dialog.getByLabel("Ngày khởi công").fill("2026-10-05");
  await dialog.getByRole("button", { name: "Tạo dự án", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".ops-project-card").getByRole("link", { name: createdName, exact: true })).toBeVisible();
  const projectId = new URL(page.url()).searchParams.get("projectId");
  expect(Number(projectId)).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator(".ops-project-card").filter({ hasText: createdName })).toContainText("1 người");
  const nav = page.getByRole("navigation");
  await nav.getByRole("link", { name: "Lịch làm việc", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/calendar\\?projectId=${projectId}$`));
  await expect(page.getByRole("checkbox")).toHaveCount(7);
  await expect(page.getByRole("checkbox", { name: "Chủ nhật" })).not.toBeChecked();
  await page.getByRole("checkbox", { name: "Thứ 7" }).uncheck();
  await page.getByRole("button", { name: "Lưu lịch làm việc" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã lưu tuần làm việc" })).toBeVisible();
  await page.getByRole("button", { name: "Thêm ngày nghỉ" }).click();
  await dialog.getByLabel("Ngày nghỉ", { exact: true }).fill("2026-10-07");
  await dialog.getByLabel("Tên ngày nghỉ").fill("Nghỉ công trường");
  await dialog.getByLabel("Ghi chú").fill("Kiểm tra lưu dữ liệu");
  await dialog.getByRole("button", { name: "Lưu ngày nghỉ" }).click();
  await expect(page.getByRole("cell", { name: "Nghỉ công trường", exact: true })).toBeVisible();
  await expect(page.locator(".calendar-day.is-holiday").filter({hasText:"Nghỉ công trường"})).toBeVisible();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Thứ 7" })).not.toBeChecked();
  await expect(page.getByRole("cell", { name: "Nghỉ công trường", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Thêm ngày nghỉ" }).click();
  await dialog.getByLabel("Ngày nghỉ", { exact: true }).fill("2026-10-07");
  await dialog.getByLabel("Tên ngày nghỉ").fill("Trùng ngày");
  await dialog.getByRole("button", { name: "Lưu ngày nghỉ" }).click();
  await expect(dialog.getByRole("alert")).toContainText("đã tồn tại");
  await dialog.getByRole("button", { name: "Hủy" }).click();
  await page.getByRole("button", { name: "Sửa", exact: true }).click();
  await dialog.getByLabel("Tên ngày nghỉ").fill("Ngày nghỉ đã sửa");
  await dialog.getByRole("button", { name: "Lưu ngày nghỉ" }).click();
  await expect(page.getByRole("cell", { name: "Ngày nghỉ đã sửa" })).toBeVisible();
  await page.getByRole("button", { name: "Xóa", exact: true }).click();
  await dialog.getByRole("button", { name: "Xóa ngày nghỉ" }).click();
  await expect(page.getByText("Chưa có ngày nghỉ riêng.", { exact: false })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("calendar-desktop.png"), fullPage: true });
  for (const link of await nav.getByRole("link").all()) {
    const href=await link.getAttribute("href");
    if (href==="/system-admin") expect(href).toBe("/system-admin");
    else expect(href).toContain(`projectId=${projectId}`);
  }
  await nav.getByRole("link", { name: "Giao việc hiện trường", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Chưa có công việc để hiển thị" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("real member invitation becomes membership on registration, role changes and removal persist",async ({ page }) => {
  await login(page,"admin"); const { projectId }=await fixture(page);
  await page.goto(`/members?projectId=${projectId}`);
  await expect(page.getByRole("heading",{ name:"Thành viên & phân quyền",exact:true })).toBeVisible();
  await expect(page.locator(".xds-members-demo-label")).toContainText("thành viên");
  const email=`codex-member-${Date.now()}@e2e.test`;
  await page.getByRole("button",{ name:"Mời thành viên" }).click();
  let dialog=page.getByRole("dialog"); await dialog.getByLabel("Email thành viên").fill(email); await dialog.getByLabel("Vai trò trong dự án").selectOption("worker"); await dialog.getByRole("button",{ name:"Gửi lời mời" }).click();
  const invitationUrl=await dialog.getByLabel("Liên kết lời mời").inputValue();
  await dialog.getByRole("button",{ name:"Đóng",exact:true }).click();
  await page.getByRole("tab",{ name:"Lời mời chờ xử lý" }).click(); await expect(page.getByRole("tabpanel").getByText(email,{ exact:true })).toBeVisible();
  const registration=await page.request.post("/auth/register",{ data:{ fullname:"Thành viên E2E",email,password:"Operations-only-E2E-123!",role:"viewer",invitation_token:new URL(invitationUrl).searchParams.get("token") } }); expect(registration.status()).toBe(201);
  await page.reload(); await expect(page.getByText("Thành viên E2E",{ exact:true })).toBeVisible(); await expect(page.getByRole("row").filter({ hasText:email })).toContainText("Đội trưởng");
  await page.getByRole("button",{ name:"Thao tác với Thành viên E2E" }).click(); await page.getByRole("button",{ name:"Đổi vai trò Thành viên E2E" }).click(); dialog=page.getByRole("dialog"); await dialog.getByLabel("Vai trò trong dự án").selectOption("engineer"); await dialog.getByRole("button",{ name:"Lưu vai trò" }).click();
  await expect(page.getByRole("row").filter({ hasText:email })).toContainText("Kỹ sư giám sát");
  await page.reload(); await expect(page.getByRole("row").filter({ hasText:email })).toContainText("Kỹ sư giám sát");
  await page.getByRole("button",{ name:"Thao tác với Thành viên E2E" }).click(); await page.getByRole("button",{ name:"Gỡ thành viên Thành viên E2E" }).click(); dialog=page.getByRole("dialog"); await dialog.getByRole("button",{ name:"Xác nhận" }).click(); await expect(page.getByText(email,{ exact:true })).toHaveCount(0);
  await page.setViewportSize({ width:390,height:844 }); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("real manager assignment, worker reporting, issue notification and manager resolution", async ({ page, browser }) => {
  await login(page, "project_manager");
  const { projectId } = await fixture(page);
  await page.goto(`/field-assignments?projectId=${projectId}`);
  await page.getByRole("button", { name: "Tạo đội thi công" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tên đội").fill("Đội móng kiểm thử");
  await dialog.getByRole("checkbox", { name: "Đội trưởng kiểm thử" }).check();
  await dialog.getByRole("button", { name: "Tạo đội", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const row = page.getByRole("row").filter({ has: page.getByRole("button", { name: "Đổ bê tông", exact: true }) });
  await row.getByRole("button", { name: "Gán đội" }).click();
  await dialog.getByLabel("Đội phụ trách").selectOption({ label: "Đội móng kiểm thử (1 thành viên)" });
  await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(row).toContainText("Đội móng kiểm thử");
  await row.getByRole("button", { name: "Kế hoạch", exact: true }).click();
  await dialog.getByLabel("Khối lượng kế hoạch").fill("10");
  await dialog.getByLabel("Đơn vị").fill("m³");
  await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(row).toContainText("0 / 10 m³");
  await row.getByRole("button", { name: "Chi tiết" }).click();
  await expect(dialog.getByText("Giao việc → Đội móng kiểm thử")).toBeVisible();
  await dialog.getByRole("button", { name: "Đóng", exact: true }).click();
  await page.screenshot({ path: test.info().outputPath("assignments-desktop.png"), fullPage: true });
  const workerContext = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: { width: 390, height: 844 } });
  try {
    const worker = await workerContext.newPage(); await login(worker, "worker");
    await worker.goto(`/field-assignments?projectId=${projectId}`);
    await expect(worker.getByRole("button", { name: "Đổ bê tông", exact: true })).toBeVisible();
    await expect(worker.getByRole("button", { name: "Lắp thép", exact: true })).toHaveCount(0);
    await expect(worker.getByRole("button", { name: "Tạo đội thi công" })).toHaveCount(0);
    await worker.getByRole("button", { name: "Báo khối lượng" }).click();
    dialog = worker.getByRole("dialog");
    await dialog.getByLabel("Khối lượng (m³)").fill("12");
    await dialog.getByRole("button", { name: "Gửi báo cáo" }).click();
    await expect(worker.getByRole("status").filter({ hasText: "vượt" })).toBeVisible();
    await worker.reload();
    await expect(worker.getByRole("table")).toContainText("12 / 10 m³");
    await worker.getByRole("button", { name: "Vướng mắc", exact: true }).click();
    await dialog.getByLabel("Mô tả vướng mắc").fill("Cần bổ sung vật tư tại công trường");
    await dialog.getByRole("button", { name: "Gửi báo cáo" }).click();
    await expect(worker.getByRole("table")).toContainText("1 vướng mắc đang mở");
    expect(await worker.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await worker.screenshot({ path: test.info().outputPath("assignments-worker-mobile.png"), fullPage: true });
    await worker.getByRole("button", { name: "Mở menu" }).click();
    await worker.getByRole("button", { name: "Đóng menu" }).click();
  } finally { await workerContext.close(); }
  await page.getByRole("navigation").getByRole("link", { name: "Thông báo", exact: true }).click();
  await page.getByRole("link", { name: "Vướng mắc mới: Đổ bê tông" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Cần bổ sung vật tư tại công trường");
  await dialog.getByRole("button", { name: "Ghi nhận xử lý" }).click();
  await dialog.getByLabel("Ghi chú xử lý").fill("Đã cấp đủ vật tư");
  await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(page.getByRole("table")).not.toContainText("1 vướng mắc đang mở");
  await page.getByRole("navigation").getByRole("link", { name: "Nhật ký hệ thống", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("Xử lý vướng mắc");
});

test("all sidebar routes render and selected project survives navigation; mobile does not overflow", async ({ page }) => {
  await login(page);
  const { projectId } = await fixture(page);

  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/projects?projectId=${projectId}`);
  // Membership/account fetches finish after the shell's two public links.
  // Wait for the same full menu contract before taking a synchronous snapshot.
  await expect(page.getByRole('navigation').getByRole('link')).toHaveCount(17);
  const links = await page.getByRole("navigation").getByRole("link").evaluateAll((elements) => elements.map((element) => ({ href: element.getAttribute("href"), name: element.textContent })));
  expect(links).toHaveLength(17);
  expect(links.some(link=>link.href==="/system-admin")).toBe(true);
  for (const link of links) {
    await page.goto(link.href);
    await expect(page.locator("#root")).not.toBeEmpty();
    if (link.href==="/system-admin") await expect(page.getByRole("heading",{name:"Quản trị hệ thống",exact:true})).toBeVisible();
    else expect(new URL(page.url()).searchParams.get("projectId")).toBe(String(projectId));
  }
  await page.goto(`/projects?projectId=${projectId}`);
  await expect(page.locator(".ops-project-card").first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("projects-desktop.png"), fullPage: true });
  for (const route of ["projects", "calendar", "field-assignments"]) {
    await page.goto(`/${route}?projectId=${projectId}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});
