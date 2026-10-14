import { expect, test } from "@playwright/test";

const schedule = [
    { id: 41, name: "Đào móng", duration_days: 4, es: 0, ef: 4, ls: 0, lf: 4, slack: 0, isCritical: true, percentComplete: 100 },
    { id: 43, name: "Đổ bê tông", duration_days: 3, es: 4, ef: 7, ls: 5, lf: 8, slack: 1, isCritical: false, percentComplete: 25 }
];

async function openSchedule(page, { failSave = false, tasks = schedule } = {}) {
    tasks = tasks.map(task => ({ ...task }));
    let shouldFail = failSave;
    let savedBody;
    await page.route("**/auth/me**", (route) => route.fulfill({
        json: { user: { id: 1, fullname: "Test User", role: "admin" } }
    }));
    await page.route(/\/projects(?:\?.*)?$/, (route) => route.fulfill({
        json: { projects: [{ id: 37, name: "Dự án kiểm thử", member_role: "manager" }] }
    }));
    await page.route("**/projects/37/**", async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path.endsWith("/schedule")) return route.fulfill({ json: { schedule: tasks } });
        if (path.endsWith("/notifications")) return route.fulfill({ json: { notifications: [], unread_count: 0 } });
        if (path.endsWith("/items")) return route.fulfill({ json: { items: [] } });
        if (path.endsWith("/tasks")) return route.fulfill({ json: { tasks } });
        if (path.endsWith("/dependencies")) return route.fulfill({ json: { dependencies: [] } });
        if (["/overview", "/calendar", "/milestone-alerts", "/work-item-milestones"].some(suffix => path.endsWith(suffix))) return route.fulfill({ json: {} });
        if (path.endsWith("/progress")) {
            savedBody = request.postDataJSON();
            if (!shouldFail) Object.assign(tasks.find(task => task.id === 43), savedBody);
            return shouldFail
                ? route.fulfill({ status: 422, json: { message: "Dữ liệu tiến độ bị từ chối" } })
                : route.fulfill({ json: { task: { id: 43, actual_start_date: savedBody.actualStart, actual_end_date: savedBody.actualEnd, percent_complete: savedBody.percentComplete } } });
        }
        return route.continue();
    });
    await page.goto("/schedule?projectId=37");
    await expect(page.locator(".gantt-grid")).toHaveAttribute("data-task-count", String(tasks.length));
    return { setSaveFailure: (value) => { shouldFail = value; }, getSavedBody: () => savedBody };
}

test("T-31 gridlines share tick coordinates and T-32 critical bars have a non-color marker", async ({ page }) => {
    await openSchedule(page);
    const axis = await page.locator(".gantt-axis .gantt-gridline").evaluateAll((nodes) => nodes.map((node) => node.style.left));
    const body = await page.locator(".gantt-body-gridlines .gantt-gridline").evaluateAll((nodes) => nodes.map((node) => node.style.left));
    expect(body).toEqual(axis);
    await expect(page.locator(".gantt-bar-critical")).toHaveCount(1);
    await expect(page.locator(".gantt-bar-critical .gantt-critical-marker")).toHaveCount(1);
    expect(await page.locator(".gantt-scroll").evaluate((node) => node.scrollWidth)).toBeGreaterThan(
        await page.locator(".gantt-scroll").evaluate((node) => node.clientWidth)
    );
});

test("T-30 switches the schedule axis between days and weeks without moving bars", async ({ page }) => {
    await openSchedule(page);
    await expect(page.locator(".gantt-tick-label")).toHaveText(Array.from({ length: 8 }, (_, day) => `Ngày ${day}`));
    const positions = await page.locator(".gantt-bar").evaluateAll((bars) => bars.map((bar) => ({
        left: bar.style.left, width: bar.style.width
    })));

    await page.getByRole("button", { name: "Tuần" }).click();
    await expect(page.getByRole("button", { name: "Tuần" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".gantt-tick-label")).toHaveText(["Tuần 1", "Tuần 2"]);
    expect(await page.locator(".gantt-bar").evaluateAll((bars) => bars.map((bar) => ({
        left: bar.style.left, width: bar.style.width
    })))).toEqual(positions);

    await page.getByRole("button", { name: "Ngày" }).click();
    await expect(page.locator(".gantt-tick-label")).toHaveCount(8);
});

test("T-30 keeps long-range axis labels from overlapping", async ({ page }) => {
    const tasks = [{
        id: 51, name: "Long task", duration_days: 90, es: 0, ef: 90, ls: 0, lf: 90, slack: 0, isCritical: true
    }];
    await openSchedule(page, { tasks });
    const overlaps = await page.locator(".gantt-tick-label").evaluateAll((nodes) => nodes.slice(1).some((node, index) =>
        nodes[index].getBoundingClientRect().right > node.getBoundingClientRect().left));
    expect(overlaps).toBe(false);
});

test("T-31 renders a 500-task list without changing the shared scale", async ({ page }) => {
    const tasks = Array.from({ length: 500 }, (_, index) => ({
        id: index + 1,
        name: `Task ${index + 1}`,
        duration_days: 1,
        es: index,
        ef: index + 1,
        ls: index,
        lf: index + 1,
        slack: 0,
        isCritical: index === 0
    }));
    await openSchedule(page, { tasks });
    await expect(page.locator(".gantt-grid")).toHaveAttribute("data-task-count", "500");
    expect(await page.locator(".gantt-bar").count()).toBeLessThan(60);
    await page.locator(".gantt-scroll").evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await expect(page.locator('.gantt-row[data-task-id="500"]')).toBeVisible();
    await expect(page.locator('.gantt-row[data-task-id="500"] .gantt-bar')).toHaveCSS("left", "27944px");
});

test("T-33 keyboard tooltip has finite coordinates and closes with Escape", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSchedule(page);
    await page.locator(".gantt-bar").last().focus();
    const tooltip = page.getByRole("tooltip");
    for (const label of ["ES", "EF", "LS", "LF", "Total Float"]) await expect(tooltip).toContainText(label);
    const tooltipBox = await tooltip.boundingBox();
    expect(tooltipBox.x).toBeGreaterThanOrEqual(0);
    expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(390);
    await page.keyboard.press("Escape");
    await expect(tooltip).toHaveCount(0);
    await page.locator(".gantt-bar").first().focus();
    await expect(tooltip).toBeVisible();
    await page.getByRole("heading", { name: "Tiến độ & đường găng" }).click();
    await expect(tooltip).toHaveCount(0);
});

test("T-35 validates the form and updates only after the server confirms", async ({ page }) => {
    const state = await openSchedule(page, { failSave: true });
    await page.locator(".gantt-bar").last().click();
    await expect(page.getByRole("dialog", { name: "Chi tiết công việc" })).toBeVisible();
    await page.getByRole("button", { name: "Cập nhật tiến độ", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Cập nhật tiến độ thực tế" })).toBeVisible();
    await page.getByLabel("Ngày bắt đầu thực tế").fill("2026-04-12");
    await page.getByLabel("Ngày kết thúc thực tế").fill("2026-04-11");
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(page.getByText("Ngày kết thúc không được sớm hơn ngày bắt đầu")).toBeVisible();
    await page.getByLabel("Ngày kết thúc thực tế").fill("2026-04-13");
    await page.getByLabel("Phần trăm hoàn thành").fill("50");
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(page.getByRole("alert")).toContainText("Dữ liệu tiến độ bị từ chối");
    state.setSaveFailure(false);
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect.poll(state.getSavedBody).toMatchObject({
        actualStart: "2026-04-12", actualEnd: "2026-04-13", percentComplete: 50
    });
    await expect(page.getByRole("status")).toContainText("Đã cập nhật tiến độ");
    await expect(page.getByRole("dialog").locator(".schedule-drawer-progress")).toContainText("50%");
    await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator(".gantt-bar").last().locator(".gantt-bar-label")).toHaveText("50%");
});

test("T-35 asks before reducing a completed task", async ({ page }) => {
    await openSchedule(page);
    await page.locator(".gantt-bar").first().click();
    await page.getByRole("button", { name: "Cập nhật tiến độ", exact: true }).click();
    await page.getByLabel("Phần trăm hoàn thành").fill("50");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(page.getByRole("heading", { name: "Cập nhật tiến độ thực tế" })).toBeVisible();
});
