import { expect,test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";
const password="System-UI-test-only-123!",fixturePassword="Operations-only-E2E-123!";
const backend=fileURLToPath(new URL("../../backend/",import.meta.url));
async function login(page,email="admin@e2e.test",pass=fixturePassword) { expect((await page.request.post("/auth/login",{ data:{ email,password:pass } })).status()).toBe(200); }
async function fixture(page) { return (await page.request.get("http://127.0.0.1:3031/__fixture")).json(); }
function manualRole(f,email,action="grant") {
  const env={ ...process.env,PGOPTIONS:`-c search_path=${f.schema}` };
  if (env.SPRINT2_TEST_DATABASE_URL) { const u=new URL(env.SPRINT2_TEST_DATABASE_URL); Object.assign(env,{ DB_HOST:u.hostname,DB_PORT:u.port || "5432",DB_USER:decodeURIComponent(u.username),DB_PASSWORD:decodeURIComponent(u.password) }); }
  return execFileSync(process.execPath,["scripts/admin-bootstrap.cjs",`--database=${f.database}`,`--email=${email}`,`--action=${action}`,`--confirm=${action.toUpperCase()}_SUPER_ADMIN:${f.database}:${email}`],{ cwd:backend,env,encoding:"utf8" });
}
test("registration stays ordinary; real CLI grants Super Admin; UI creates projects and assigns management; revoke refreshes privileges",async ({ page,browser }) => {
  const errors=[]; page.on("pageerror",e => errors.push(e.message));
  const f=await fixture(page),email=`ui-root-${crypto.randomUUID()}@test.example`;
  await page.goto("/register"); await expect(page.getByRole("combobox")).toHaveCount(0);
  await page.getByLabel("Họ và tên",{ exact:true }).fill("Quản trị kiểm thử"); await page.getByLabel("Email",{ exact:true }).fill(email); await page.getByLabel("Mật khẩu",{ exact:true }).fill(password); await page.getByLabel("Xác nhận mật khẩu",{ exact:true }).fill(password); await page.getByRole("checkbox").check(); await page.getByRole("button",{ name:"Tạo tài khoản",exact:true }).click(); await expect(page).toHaveURL(/\/login/);
  await login(page,email,password); await page.goto("/home"); await expect(page.getByRole("navigation").getByRole("link",{ name:"Quản trị hệ thống",exact:true })).toHaveCount(0);
  expect((await (await page.request.get("/auth/me")).json()).user.system_role).toBe("user"); expect((await page.request.get("/admin/users")).status()).toBe(403);
  expect((await page.request.post("/auth/register",{ data:{ fullname:"Bad",email:`bad-${crypto.randomUUID()}@test.example`,password,role:"super_admin" } })).status()).toBe(403);
  expect(manualRole(f,email)).toContain("audited"); let revoked=false;
  try {
  await page.reload(); await page.getByRole("navigation").getByRole("link",{ name:"Quản trị hệ thống",exact:true }).click(); await expect(page.getByRole("heading",{ name:"Quản trị hệ thống",exact:true })).toBeVisible();
  await page.getByRole("link",{ name:"Tạo / quản lý dự án",exact:true }).click(); await page.getByRole("button",{ name:"Tạo dự án",exact:true }).first().click(); let d=page.getByRole("dialog");
  const name=`Dự án quản trị ${Date.now()}`; await d.getByLabel("Tên dự án").fill(name); await d.getByLabel("Địa điểm").fill("Kiểm thử"); await d.getByLabel("Ngày khởi công").fill("2026-10-01"); await d.getByRole("button",{ name:"Tạo dự án",exact:true }).click(); await expect(d).toHaveCount(0);
  const project=(await (await page.request.get("/projects")).json()).projects.find(p => p.name===name),managerEmail=`ui-manager-${crypto.randomUUID()}@test.example`;
  expect((await page.request.post("/auth/register",{ data:{ fullname:"Ban quản lý dự án",email:managerEmail,password } })).status()).toBe(201);
  await page.goto("/system-admin"); await page.getByLabel("Tìm tên / email").fill(managerEmail); await page.getByRole("button",{ name:"Tìm kiếm",exact:true }).click(); const row=page.getByRole("row").filter({ hasText:managerEmail }); await expect(row).toContainText("Người dùng"); await row.getByRole("button",{ name:"Vai trò dự án",exact:true }).click(); d=page.getByRole("dialog"); await d.getByLabel("Dự án",{ exact:true }).selectOption(String(project.id)); await d.getByLabel("Vai trò trong dự án").selectOption("admin"); await d.getByRole("button",{ name:"Lưu vai trò dự án",exact:true }).click(); await expect(d).toHaveCount(0); await expect(row).toContainText(name); await expect(row).toContainText("Ban quản lý");
  const context=await browser.newContext({ baseURL:"http://127.0.0.1:4175" });
  try {
    const manager=await context.newPage(); await login(manager,managerEmail,password); await manager.goto(`/members?projectId=${project.id}`); await manager.getByRole("button",{ name:"Mời thành viên",exact:true }).click(); const md=manager.getByRole("dialog"); await md.getByLabel("Email thành viên").fill("engineer@e2e.test"); await md.getByLabel("Vai trò trong dự án").selectOption("engineer"); await md.getByRole("button",{ name:"Gửi lời mời",exact:true }).click(); await expect(md).toHaveCount(0); await expect(manager.getByRole("row").filter({ hasText:"engineer@e2e.test" })).toContainText("Kỹ sư giám sát");
    expect((await manager.request.get("/admin/users")).status()).toBe(403); expect((await manager.request.get(`/projects/${f.projectId}/journals`)).status()).toBe(403);
  } finally { await context.close(); }
  await page.screenshot({ path:test.info().outputPath("system-admin-desktop.png"),fullPage:true });
  await page.getByRole("button",{ name:"Nhật ký thay đổi quyền",exact:true }).click(); await expect(page.getByRole("table")).toContainText("grant_super_admin"); await expect(page.getByRole("cell",{ name:"add",exact:true }).first()).toBeVisible();
  const audit=(await (await page.request.get("/admin/audit-logs")).json()).entries;
  expect(audit.some(e => e.module==="members" && e.action==="add" && e.after_value?.email==="engineer@e2e.test")).toBe(true);
  expect(manualRole(f,email,"revoke")).toContain("audited"); revoked=true; expect((await page.request.get("/admin/users")).status()).toBe(403); await page.goto("/home"); await expect(page.getByRole("navigation").getByRole("link",{ name:"Quản trị hệ thống",exact:true })).toHaveCount(0); expect(errors).toEqual([]);
  } finally { if (!revoked) manualRole(f,email,"revoke"); }
});
test("viewer reads tree and Gantt without edit controls; accountant and worker see only granted functions",async ({ page }) => {
  const f=await fixture(page); await login(page,"viewer@e2e.test"); await page.goto(`/work-items?projectId=${f.projectId}`); await expect(page.locator(".work-item-tree")).toContainText("Thi công móng"); await expect(page.getByRole("button",{ name:"Tạo",exact:true })).toHaveCount(0); await expect(page.getByRole("button",{ name:"Sửa công việc",exact:true })).toHaveCount(0);
  await page.goto(`/schedule?projectId=${f.projectId}`); await expect(page.locator(".schedule-page")).toBeVisible(); await expect(page.getByRole("button",{ name:"Chốt kế hoạch gốc",exact:true })).toHaveCount(0);
  await login(page,"accountant@e2e.test"); await page.goto(`/payments?projectId=${f.projectId}`); await expect(page.getByRole("heading",{ name:"Thanh toán",exact:true })).toBeVisible(); await expect(page.getByRole("navigation").getByRole("link",{ name:"Tiến độ & đường găng",exact:true })).toHaveCount(0); expect((await page.request.get(`/projects/${f.projectId}/schedule`)).status()).toBe(403);
  await login(page,"worker@e2e.test"); await page.goto(`/field-assignments?projectId=${f.projectId}`); await expect(page.getByRole("navigation").getByRole("link",{ name:"Giao việc hiện trường",exact:true })).toBeVisible(); await expect(page.getByRole("navigation").getByRole("link",{ name:"Quản trị hệ thống",exact:true })).toHaveCount(0); await expect(page.getByRole("button",{ name:"＋ Tạo công việc",exact:true })).toHaveCount(0);
});
test("system UI blocks last Super Admin deactivation, changes project roles and revokes removed members immediately",async ({ page,browser }) => {
  const f=await fixture(page); await login(page); await page.goto("/system-admin"); await page.getByLabel("Tìm tên / email").fill("admin@e2e.test"); await page.getByRole("button",{ name:"Tìm kiếm",exact:true }).click(); let row=page.getByRole("row").filter({ hasText:"admin@e2e.test" }); await row.getByRole("button",{ name:"Khóa tài khoản",exact:true }).click(); let d=page.getByRole("dialog"); await d.getByRole("button",{ name:"Xác nhận",exact:true }).click(); await expect(d.getByRole("alert")).toContainText("cuối cùng"); await d.getByRole("button",{ name:"Hủy",exact:true }).click();
  await page.getByLabel("Tìm tên / email").fill("engineer@e2e.test"); await page.getByRole("button",{ name:"Tìm kiếm",exact:true }).click(); row=page.getByRole("row").filter({ hasText:"engineer@e2e.test" }); await row.getByRole("button",{ name:"Vai trò dự án",exact:true }).click(); d=page.getByRole("dialog"); await d.getByLabel("Dự án",{ exact:true }).selectOption(String(f.projectId)); await d.getByLabel("Vai trò trong dự án").selectOption("viewer"); await d.getByRole("button",{ name:"Lưu vai trò dự án",exact:true }).click(); await expect(d).toHaveCount(0);
  const context=await browser.newContext({ baseURL:"http://127.0.0.1:4175" });
  try { const engineer=await context.newPage(); await login(engineer,"engineer@e2e.test"); expect((await engineer.request.get(`/projects/${f.projectId}/journals`)).status()).toBe(200); expect((await engineer.request.post(`/projects/${f.projectId}/journals`,{ data:{} })).status()).toBe(403);
    await row.getByRole("button",{ name:"Gỡ khỏi E2E công trường",exact:true }).click(); d=page.getByRole("dialog"); await d.getByRole("button",{ name:"Xác nhận",exact:true }).click(); await expect(d).toHaveCount(0); expect((await engineer.request.get(`/projects/${f.projectId}/journals`)).status()).toBe(403);
  } finally { await context.close(); }
  await page.setViewportSize({ width:390,height:844 }); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect.poll(() => page.locator(".ops-shell-sidebar").evaluate(e => e.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  await expect(page.getByRole("button",{name:"Mở menu",exact:true})).toBeVisible();
  await page.screenshot({ path:test.info().outputPath("system-admin-mobile.png"),fullPage:true });
});
