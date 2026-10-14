import { expect, test } from "@playwright/test";
import process from "node:process";
import { mkdir } from "node:fs/promises";

test.skip(!process.env.OPERATIONS_REAL_E2E, "Requires the isolated PostgreSQL E2E server");
test("Gantt actual progress recalculates CPM and preserves baseline, milestone and working calendar", async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    expect((await page.request.post("/auth/login", { data: { email: "admin@e2e.test", password: "Operations-only-E2E-123!" } })).status()).toBe(200);
    async function post(path, data) {
        const response = await page.request.post(path, { data });
        expect(response.ok(), await response.text()).toBe(true);
        return response.json();
    }
    const created = await post("/projects", { name: `Sprint 3 integrated ${Date.now()}`, location: "Hà Nội", start_date: "2026-10-01" });
    const project = created.project.id;
    const base = `/projects/${project}`;
    const item = (await post(base + "/items", { title: "Thi công móng", parent_id: null })).item;
    const first = (await post(base + "/tasks", { work_item_id: item.id, name: "Đào móng", duration_days: 3 })).task;
    const last = (await post(base + "/tasks", { work_item_id: item.id, name: "Đổ bê tông", duration_days: 2 })).task;
    await post(base + `/tasks/${last.id}/dependencies`, { predecessor_task_id: first.id, dependency_type: "FS", lag_days: 0 });
    await page.setViewportSize({ width: 1600, height: 1050 });
    await page.goto(`/schedule?projectId=${project}`);
    await expect(page.locator(".gantt-grid")).toHaveAttribute("data-task-count", "2");
    await expect(page.locator(".schedule-calendar-note")).toContainText("6 ngày/tuần");
    await page.getByRole("button", { name: "Chốt kế hoạch gốc", exact: true }).click();
    await expect(page.locator(".gantt-baseline-bar")).toHaveCount(2);
    await post(base + "/work-item-milestones", { work_item_id: item.id, name: "Bàn giao móng", target_date: "2026-10-06" });
    await page.reload();
    await expect(page.locator(".gantt-milestone-line")).toHaveCount(1);
    await page.getByRole("button", { name: "Chi tiết Đào móng", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Chi tiết công việc" });
    await drawer.getByRole("button", { name: "Cập nhật tiến độ", exact: true }).click();
    await drawer.getByLabel("Ngày bắt đầu thực tế").fill("2026-10-01");
    await drawer.getByLabel("Ngày kết thúc thực tế").fill("2026-10-07");
    await drawer.getByLabel("Phần trăm hoàn thành").fill("100");
    await drawer.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(drawer.locator(".schedule-drawer-progress")).toContainText("100%");
    await page.keyboard.press("Escape");
    await expect(page.locator(".schedule-forecast")).toContainText("Chậm 3 ngày");
    await expect(page.locator(".gantt-actual-bar")).toHaveCount(1);
    await expect(page.locator(".gantt-baseline-bar")).toHaveCount(2);
    await expect(page.locator(".alerts-section")).toContainText("Vượt 3 ngày làm việc");
    await page.getByRole("button", { name: "Xem chuỗi việc", exact: false }).click();
    await expect(page.locator(".critical-chain-step")).toHaveText(["Đào móng", "Đổ bê tông"]);
    await page.getByRole("button", { name: "Đóng", exact: true }).click();
    const positions = await page.locator(".gantt-bar").evaluateAll(bars => bars.map(bar => [bar.style.left, bar.style.width]));
    await page.getByRole("button", { name: "Tuần", exact: true }).click();
    expect(await page.locator(".gantt-bar").evaluateAll(bars => bars.map(bar => [bar.style.left, bar.style.width]))).toEqual(positions);
    await page.reload();
    await expect(page.locator(".schedule-forecast")).toContainText("Chậm 3 ngày");
    const data = await (await page.request.get(base + "/schedule")).json();
    expect(data.schedule.find(task => task.id === first.id)).toMatchObject({ es: 0, ef: 6, baseline_es: 0 });
    expect(data.schedule.find(task => task.id === last.id)).toMatchObject({ ef: 8, baseline_ef: 5 });
    await mkdir("../docs/sprint4-5/evidence", { recursive: true });
    for (const width of [1600, 1366, 768, 375]) {
        await page.setViewportSize({ width, height: 1050 });
        await page.evaluate(() => scrollTo(0,0));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `../docs/sprint4-5/evidence/schedule-${width}.png`, fullPage: true });
    }
    expect(errors).toEqual([]);
});
