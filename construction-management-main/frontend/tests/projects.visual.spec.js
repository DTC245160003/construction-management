import { expect, test } from "@playwright/test";
import process from "node:process";

// Real sessions/API/PostgreSQL via backend/scripts/operations-e2e-server.cjs.
// Only explicit loading/error/empty cases intercept HTTP; no fixture enters app code.
test.skip(!process.env.OPERATIONS_REAL_E2E, "Requires the isolated PostgreSQL E2E server");
test.use({ reducedMotion: "reduce" });

async function login(page, role = "admin") {
  const response = await page.request.post("/auth/login", { data: { email: `${role}@e2e.test`, password: "Operations-only-E2E-123!" } });
  expect(response.status()).toBe(200);
}
async function fixture(page) { return (await page.request.get("http://127.0.0.1:3031/__fixture")).json(); }
const screenshot = (page, name, fullPage = false) => page.screenshot({ path: `test-results/projects-${name}.png`, fullPage, animations: "disabled" });

test("Projects real create/edit, inline validation, retry and persistence", async ({ page }) => {
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await page.goto("/projects");
  await page.getByRole("button", { name: "Tạo dự án", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Tên dự án")).toBeFocused();
  await dialog.getByRole("button", { name: "Tạo dự án", exact: true }).click();
  await expect(dialog.getByText("Vui lòng nhập tên dự án.")).toBeVisible();
  await expect(dialog.getByText("Vui lòng nhập địa điểm công trình.")).toBeVisible();
  await expect(dialog.getByLabel("Tên dự án")).toBeFocused();
  const name = `QA · Công trình mới ${Date.now()}`;
  await dialog.getByLabel("Tên dự án").fill(name);
  await dialog.getByLabel("Địa điểm").fill("Thủ Đức, TP. Hồ Chí Minh");
  await dialog.getByLabel("Ngày khởi công").fill("2026-10-05");
  await screenshot(page, "create-modal");
  let release;
  await page.route("**/projects", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise((resolve) => { release = resolve; });
    await route.fulfill({ status: 503, json: { message: "Không thể lưu lúc này. Vui lòng thử lại." } });
  });
  await dialog.getByRole("button", { name: "Tạo dự án", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Đang lưu…" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Hủy" })).toBeDisabled();
  await expect.poll(() => Boolean(release)).toBe(true); release();
  await expect(dialog.getByRole("alert")).toContainText("Không thể lưu lúc này");
  await expect(dialog.getByLabel("Tên dự án")).toHaveValue(name);
  await page.unroute("**/projects");
  await dialog.getByRole("button", { name: "Tạo dự án", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Đã lưu dự án" })).toContainText(name);
  const id = new URL(page.url()).searchParams.get("projectId");
  await page.reload();
  const card = page.locator(".ops-project-card").filter({ hasText: name });
  await expect(card).toContainText("1 người");
  await card.getByRole("button", { name: `Thao tác dự án ${name}` }).click();
  await page.getByRole("button", { name: "Chỉnh sửa dự án", exact: true }).click();
  await dialog.getByLabel("Trạng thái", { exact: true }).selectOption("planned");
  await dialog.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(card).toContainText("Chưa bắt đầu");
  expect((await (await page.request.get(`/projects/${id}/overview`)).json()).project.status).toBe("planned");
  await card.getByRole("link", { name: "Mở dự án", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/home\\?projectId=${id}$`));
  expect(errors).toEqual([]);
});

test("Projects filters, ordering, list menu, detail totals and responsive browser review", async ({ page }) => {
  await login(page);
  const { projectId } = await fixture(page);
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const all = (await (await page.request.get("/projects", { headers: { Accept: "application/json" } })).json()).projects;
  // Enough real projects to verify pagination and the 3/2/1-column breakpoints.
  for (let index = all.length; index < 7; index++) {
    const response = await page.request.post("/projects", { data: { name: `QA · Dự án kiểm thử ${index}`, location: "Hà Nội", start_date: "2026-10-05" } });
    expect(response.status()).toBe(201);
  }
  let assignmentRequests = 0;
  page.on("request", (request) => { if (/\/assignments$/.test(request.url())) assignmentRequests++; });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`/projects?projectId=${projectId}`);
  await expect(page.locator(".ops-project-card")).toHaveCount(6);
  expect(assignmentRequests).toBe(0);
  await page.getByRole("button", { name: "Trang sau" }).click();
  await expect(page.locator(".project-page-number")).toHaveText(`2 / ${Math.ceil(Math.max(7, all.length) / 6)}`);
  await page.getByRole("button", { name: "Trang trước" }).click();
  await page.getByLabel("Tìm kiếm dự án", { exact: true }).fill("e2e cong truong");
  await expect(page.locator(".ops-project-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Chi tiết", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".project-detail-stats")).toBeVisible();
  const actual = (await (await page.request.get(`/projects/${projectId}/assignments`)).json()).tasks;
  await expect(dialog.locator(".project-detail-stats > div").first()).toContainText(String(actual.length));
  await screenshot(page, "details");
  await dialog.getByRole("button", { name: "Đóng", exact: true }).last().click();
  // React StrictMode may abort and restart the first effect in development.
  expect(assignmentRequests).toBeGreaterThanOrEqual(1);
  expect(assignmentRequests).toBeLessThanOrEqual(2);
  await expect(page.locator(".project-card-metrics")).toContainText(String(actual.length));
  await page.getByRole("button", { name: "Dạng danh sách" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("button", { name: "Thao tác dự án E2E công trường", exact: true }).click();
  await expect(page.getByRole("button", { name: "Chỉnh sửa dự án", exact: true })).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(page.locator(".project-menu-panel")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Thao tác dự án E2E công trường", exact: true })).toBeFocused();
  await page.getByLabel("Tìm kiếm dự án", { exact: true }).fill("khong-co-cong-trinh-nay");
  await expect(page.getByRole("heading", { name: "Không tìm thấy dự án phù hợp" })).toBeVisible();
  await page.locator(".project-state").getByRole("button", { name: "Xóa bộ lọc" }).click();
  await page.getByLabel("Trạng thái dự án").selectOption("planned");
  await expect(page.getByRole("table").locator("tbody tr")).not.toHaveCount(0);
  await expect(page.getByRole("table").locator("tbody .project-status").first()).toHaveText("Chưa bắt đầu");
  await page.getByLabel("Trạng thái dự án").selectOption("");
  await page.getByLabel("Sắp xếp dự án").selectOption("name");
  const names = await page.locator(".project-table-name a").allTextContents();
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "vi")));
  await screenshot(page, "list-desktop");
  await page.getByRole("button", { name: "Dạng lưới" }).click();
  for (const [width, height, columns, label] of [[1600, 1000, 3, "desktop"], [1366, 900, 2, "laptop"], [768, 1024, 2, "tablet"], [390, 844, 1, "mobile"], [320, 740, 1, "small-mobile"]]) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole("heading", { name: "Dự án", exact: true })).toBeVisible();
    expect(await page.locator(".ops-project-grid").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(columns);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => scrollTo(0, 0));
    await screenshot(page, label);
    if (width === 390) {
      await page.getByRole("button", { name: "Mở menu" }).click();
      await expect(page.getByRole("navigation")).toBeInViewport();
      await screenshot(page, "mobile-drawer");
      await page.getByRole("button", { name: "Đóng menu" }).click();
      await page.getByRole("button", { name: "Tạo dự án", exact: true }).click();
      await expect(dialog.getByRole("button", { name: "Tạo dự án", exact: true })).toBeInViewport();
      await screenshot(page, "mobile-modal");
      await dialog.getByRole("button", { name: "Hủy" }).click();
    }
  }
  expect(errors).toEqual([]);
});

test("Projects loading, server error/retry and empty states render in browser", async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1366, height: 900 });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/projects", async (route) => { if (route.request().resourceType() === "document") return route.continue(); await gate; await route.continue(); });
  await page.goto("/projects");
  await expect(page.getByRole("status", { name: "Đang tải danh sách dự án" })).toBeVisible();
  await screenshot(page, "loading"); release();
  await expect(page.locator(".ops-project-card").first()).toBeVisible();
  await page.unroute("**/projects");
  await page.route("**/projects", (route) => route.request().resourceType() === "document" ? route.continue() : route.fulfill({ status: 500, json: { message: "Kết nối tạm thời gián đoạn." } }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Không thể tải danh sách dự án" })).toBeVisible();
  await screenshot(page, "error");
  await page.unroute("**/projects");
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.locator(".ops-project-card").first()).toBeVisible();
  await page.route("**/projects", (route) => route.request().resourceType() === "document" ? route.continue() : route.fulfill({ json: { projects: [], can_create: true } }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Chưa có dự án", exact: true })).toBeVisible();
  await screenshot(page, "empty");
  await page.locator(".project-state").getByRole("button", { name: "Tạo dự án" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("Projects role-aware actions and shared topbar search/help work", async ({ page }) => {
  await login(page, "accountant");
  const { projectId } = await fixture(page);
  let assignmentRequests = 0;
  page.on("request", (request) => { if (/\/assignments$/.test(request.url())) assignmentRequests++; });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`/projects?projectId=${projectId}`);
  await expect(page.locator(".ops-project-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Tạo dự án" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Chi tiết", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Thao tác dự án E2E công trường" }).click();
  await expect(page.getByRole("button", { name: "Chỉnh sửa dự án" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Trợ giúp", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Chọn dự án ở thanh trên cùng");
  await page.keyboard.press("Escape");
  await page.getByLabel("Tìm dự án trong hệ thống").fill("e2e");
  await page.getByRole("button", { name: "Tìm dự án", exact: true }).click();
  await expect(page.getByLabel("Tìm kiếm dự án", { exact: true })).toHaveValue("e2e");
  await expect(page.locator(".ops-project-card")).toHaveCount(1);
  expect(new URL(page.url()).searchParams.get("projectId")).toBe(String(projectId));
  expect(assignmentRequests).toBe(0);
});
