import { expect, test } from "@playwright/test";

async function project(page, { calendar = true, optionalFailure = false } = {}) {
    await page.clock.setFixedTime(new Date("2026-10-06T05:00:00Z"));
    const items = [{ id: 10, title: "Chuẩn bị", parent_id: null }, { id: 20, title: "Thi công phần thô", parent_id: null }];
    const tasks = [
        { id: 1, name: "Chuẩn bị mặt bằng", work_item_id: 10, duration_days: 3, es: 0, ef: 3, ls: 0, lf: 3, slack: 0, isCritical: true, percentComplete: 100, actualStart: "2026-10-01", actualEnd: "2026-10-04", assignee_name: "Nguyễn Văn An" },
        { id: 2, name: "Đào móng công trình", work_item_id: 10, duration_days: 4, es: 3, ef: 7, ls: 3, lf: 7, slack: 0, isCritical: true, percentComplete: 50, actualStart: "2026-10-03T17:00:00.000Z", assignee_name: "Nguyễn Văn An" },
        { id: 3, name: "Lắp cốt thép", work_item_id: 20, duration_days: 2, es: 7, ef: 9, ls: 8, lf: 10, slack: 1, isCritical: false, percentComplete: 0, assignee_name: "Trần Minh" },
        { id: 4, name: "Nghiệm thu móng", work_item_id: 20, duration_days: 0, es: 9, ef: 9, ls: 9, lf: 9, slack: 0, isCritical: false, is_milestone: true, percentComplete: 0 },
        { id: 5, name: "Chuẩn bị vật tư", work_item_id: 10, duration_days: 4, es: 0, ef: 4, ls: 2, lf: 6, slack: 2, isCritical: false, percentComplete: 20 },
        { id: 6, name: "Dựng cốp pha", work_item_id: 20, duration_days: 4, es: 4, ef: 8, ls: 5, lf: 9, slack: 1, isCritical: false, percentComplete: 10 }
    ];
    const dependencies = [
        { id: 1, predecessor_task_id: 1, successor_task_id: 2, dependency_type: "FS", lag_days: 0 },
        { id: 2, predecessor_task_id: 2, successor_task_id: 3, dependency_type: "FS", lag_days: 0 },
        { id: 3, predecessor_task_id: 3, successor_task_id: 4, dependency_type: "FF", lag_days: 0 },
        { id: 4, predecessor_task_id: 5, successor_task_id: 6, dependency_type: "SS", lag_days: 1 },
        { id: 5, predecessor_task_id: 2, successor_task_id: 6, dependency_type: "SF", lag_days: 0 }
    ];
    const requests = [];
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/auth/me**", (route) => route.fulfill({ json: { user: { id: 1, fullname: "Test User", role: "admin" } } }));
    await page.route(/\/projects(?:\?.*)?$/, (route) => route.fulfill({ json: { projects: [{ id: 37, name: "Dự án kiểm thử", member_role: "manager" }] } }));
    await page.route("**/projects/37/**", (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        const body = request.postDataJSON();
        requests.push({ path, method: request.method(), body });
        const json = (value, status = 200) => route.fulfill({ json: value, status });
        if (request.method() === "GET") {
            if (path.endsWith("/schedule")) return json({ schedule: new URL(request.url()).searchParams.get("critical") === "true" ? tasks.filter(task => task.isCritical) : tasks });
            if (path.endsWith("/notifications")) return json({ notifications: [], unread_count: 0 });
            if (path.endsWith("/milestone-alerts")) return json({ alerts: [] });
            if (optionalFailure) return json({ message: "Không có quyền truy cập" }, 403);
            if (path.endsWith("/overview")) return json({ project: { start_date: calendar ? "2026-10-01" : null } });
            if (path.endsWith("/calendar")) return json({ calendar: { working_days: [1,2,3,4,5,6] }, holidays: [] });
            if (path.endsWith("/work-item-milestones")) return json({ milestones: [] });
            if (path.endsWith("/items")) return json({ items });
            if (path.endsWith("/tasks")) return json({ tasks });
            if (path.endsWith("/dependencies")) return json({ dependencies });
        }
        if (request.method() === "POST" && path.endsWith("/tasks")) {
            const saved = { id: 7, ...body, es: 9, ef: 9 + body.duration_days, ls: 9, lf: 9 + body.duration_days, slack: 0, isCritical: true, percentComplete: 0 };
            tasks.push(saved);
            return json({ task: saved }, 201);
        }
        if (request.method() === "PATCH") {
            const id = Number(path.endsWith("/progress") ? path.split("/").at(-2) : path.split("/").at(-1));
            const task = tasks.find((task) => task.id === id);
            Object.assign(task, body);
            if (path.endsWith("/progress")) return json({ task: { id, actual_start_date: body.actualStart, actual_end_date: body.actualEnd, percent_complete: body.percentComplete } });
            return json({ task });
        }
        return json({ message: "Unexpected fixture request" }, 500);
    });
    await page.goto("/schedule?projectId=37");
    await expect(page.locator(".gantt-row")).toHaveCount(6);
    if (!optionalFailure) await expect(page.locator(".gantt-group-row")).toHaveCount(2);
    return { tasks, requests, errors };
}

test("schedule visual hierarchy, real KPIs, calendar, weekends, critical flags and all dependency types", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const state = await project(page);
    await expect(page.getByRole("heading", { name: "Tiến độ & đường găng" })).toBeVisible();
    await expect(page.locator(".schedule-kpi")).toHaveCount(4);
    await expect(page.locator(".schedule-kpi").nth(1)).toContainText("1/6");
    await expect(page.locator(".schedule-kpi").nth(2)).toContainText("1");
    await expect(page.locator(".schedule-kpi").nth(3)).toContainText("2");
    await expect(page.locator(".gantt-today")).toHaveCount(1);
    expect(await page.locator(".gantt-weekend").count()).toBeGreaterThan(0);
    await expect(page.locator(".gantt-milestone")).toHaveCount(1);
    await expect(page.locator(".gantt-dependency")).toHaveCount(5);
    for (const type of ["FS", "FF", "SS", "SF"]) expect(await page.locator(`.gantt-dependency[data-type="${type}"]`).count()).toBeGreaterThan(0);
    await expect(page.locator(".gantt-bar.status-late")).toHaveCount(1);
    await expect(page.locator(".gantt-bar.status-risk")).toHaveCount(0);
    await expect(page.locator(".gantt-bar-critical")).toHaveCount(2);
    await page.locator(".gantt-bar").first().hover();
    expect(await page.locator(".gantt-dependency.is-highlighted").count()).toBeGreaterThan(0);
    await page.getByRole("heading", { name: "Tiến độ & đường găng" }).hover();
    await expect(page.getByRole("table")).toBeVisible();
    for (const field of ["Khởi sớm (ES)", "Kết sớm (EF)", "Khởi muộn (LS)", "Kết muộn (LF)", "Độ trễ"]) await expect(page.getByRole("columnheader", { name: field, exact: true })).toBeVisible();
    const heading = page.getByRole("heading", { name: "Tiến độ & đường găng" });
    await heading.scrollIntoViewIfNeeded();
    await expect.poll(() => heading.evaluate((node) => node.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath("schedule-desktop.png"), fullPage: true });
    expect(state.errors).toEqual([]);
    expect(state.requests.filter((request) => request.method !== "GET")).toEqual([]);
});

test("search, status, assignee and critical filters keep project scale and KPI totals", async ({ page }) => {
    await project(page);
    const original = await page.locator(".gantt-bar").nth(1).getAttribute("style");
    await page.getByRole("searchbox", { name: "Tìm công việc" }).fill("dao mong");
    await expect(page.locator(".gantt-row")).toHaveCount(1);
    await expect(page.locator(".gantt-bar")).toHaveAttribute("style", original);
    await expect(page.locator(".schedule-kpi").nth(1)).toContainText("1/6");
    await page.getByRole("button", { name: "Hiện tất cả" }).click();
    await page.getByRole("combobox", { name: "Lọc trạng thái" }).selectOption("late");
    await expect(page.locator(".gantt-row")).toHaveCount(1);
    await expect(page.locator(".gantt-task-name")).toContainText("Chuẩn bị vật tư");
    await page.getByRole("button", { name: "Hiện tất cả" }).click();
    await page.getByRole("combobox", { name: "Lọc người phụ trách" }).selectOption("Nguyễn Văn An");
    await expect(page.locator(".gantt-row")).toHaveCount(2);
    await page.getByRole("button", { name: "Hiện tất cả" }).click();
    await page.getByRole("checkbox", { name: "Chỉ hiện công việc găng" }).check();
    await expect(page.locator(".gantt-row")).toHaveCount(2);
    await expect(page.locator(".gantt-bar-critical")).toHaveCount(2);
    await page.getByRole("button", { name: "Thu gọn tất cả" }).click();
    await expect(page.locator(".gantt-row")).toHaveCount(0);
    await page.getByRole("button", { name: "Hiện tất cả" }).click();
    await expect(page.locator(".gantt-row")).toHaveCount(6);
});

test("drawer replaces the fixed form, displays relations, saves via the same endpoint and updates bars", async ({ page }) => {
    const state = await project(page);
    await page.getByRole("button", { name: "Đào móng công trình — đường găng", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Chi tiết công việc" });
    await expect(drawer).toBeVisible();
    await expect(page.locator(".actual-progress-form")).toHaveCount(0);
    await expect(drawer.locator(".schedule-related").first()).toContainText("Chuẩn bị mặt bằng");
    await expect(drawer.locator(".schedule-related").last()).toContainText("Lắp cốt thép");
    await drawer.getByRole("button", { name: "Cập nhật tiến độ", exact: true }).click();
    await drawer.getByLabel("Ngày kết thúc thực tế").fill("2026-10-07");
    await drawer.getByLabel("Phần trăm hoàn thành").fill("75");
    await drawer.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(drawer.locator(".schedule-drawer-progress")).toContainText("75%");
    const patch = state.requests.find((request) => request.method === "PATCH");
    expect(patch).toEqual({ path: "/projects/37/tasks/2/progress", method: "PATCH", body: { actualStart: "2026-10-04", actualEnd: "2026-10-07", percentComplete: 75 } });
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
    await expect(page.locator(".gantt-bar").nth(1).locator(".gantt-bar-label")).toHaveText("75%");
    expect(state.errors).toEqual([]);
});

test("day/week/month, today and navigation preserve bars; task column stays fixed on scroll", async ({ page }) => {
    await project(page);
    const positions = await page.locator(".gantt-bar").evaluateAll((nodes) => nodes.map((node) => node.style.left));
    const x = (await page.locator(".gantt-task-name").first().boundingBox()).x;
    for (const unit of ["Tuần", "Tháng", "Ngày"]) {
        await page.getByRole("button", { name: unit, exact: true }).click();
        await expect(page.getByRole("button", { name: unit, exact: true })).toHaveAttribute("aria-pressed", "true");
        expect(await page.locator(".gantt-bar").evaluateAll((nodes) => nodes.map((node) => node.style.left))).toEqual(positions);
    }
    await page.getByRole("button", { name: "Cuộn về sau" }).click();
    await expect.poll(() => page.locator(".gantt-scroll").evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    expect((await page.locator(".gantt-task-name").first().boundingBox()).x).toBeCloseTo(x, 1);
    await page.getByRole("button", { name: "Hôm nay", exact: true }).click();
    await expect(page.locator(".gantt-today")).toBeVisible();
});

test("mobile keeps task list and horizontal timeline, shows full-width drawer, and has no console errors", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const state = await project(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: test.info().outputPath("schedule-mobile.png"), fullPage: true });
    await page.locator(".gantt").scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath("schedule-mobile-timeline.png"), fullPage: true });
    await page.getByRole("button", { name: "Chi tiết Đào móng công trình", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Chi tiết công việc" });
    await expect(drawer).toBeVisible();
    const box = await drawer.boundingBox();
    expect(box.width).toBeCloseTo(390, 0);
    await expect.poll(async () => (await drawer.boundingBox()).x).toBe(0);
    await page.screenshot({ path: test.info().outputPath("schedule-mobile-drawer.png"), fullPage: true });
    await page.keyboard.press("Escape");
    await page.locator(".gantt-bar").first().focus();
    await expect(page.getByRole("tooltip")).toBeVisible();
    const tooltip = await page.getByRole("tooltip").boundingBox();
    expect(tooltip.x).toBeGreaterThanOrEqual(0);
    expect(tooltip.x + tooltip.width).toBeLessThanOrEqual(390);
    expect(state.errors).toEqual([]);
});

test("create and edit reuse the existing task form and task endpoints", async ({ page }) => {
    const state = await project(page);
    await page.getByRole("button", { name: "Công việc", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Thêm công việc", exact: true });
    await editor.getByLabel("Tên công việc").fill("Đổ bê tông mới");
    await editor.getByLabel("Thời lượng (ngày)").fill("3");
    await editor.getByRole("button", { name: "Lưu công việc" }).click();
    await expect(page.getByRole("dialog", { name: "Sửa công việc", exact: true })).toBeVisible();
    expect(state.requests.find((request) => request.method === "POST")).toEqual({ path: "/projects/37/tasks", method: "POST", body: { name: "Đổ bê tông mới", work_item_id: 10, duration_days: 3 } });
    await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator(".gantt-row")).toHaveCount(7);
    await page.getByRole("button", { name: "Chi tiết Đào móng công trình", exact: true }).click();
    await page.getByRole("button", { name: "Chỉnh sửa", exact: true }).click();
    await page.getByRole("dialog", { name: "Sửa công việc", exact: true }).getByLabel("Tên công việc").fill("Đào móng đã sửa");
    await page.getByRole("button", { name: "Lưu công việc" }).click();
    await expect.poll(() => state.requests.filter((request) => request.method === "PATCH").length).toBe(1);
    await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator(".gantt-task-name").filter({ hasText: "Đào móng đã sửa" })).toHaveCount(1);
});

test("missing supporting data keeps the schedule usable and does not fabricate dates or assignees", async ({ page }) => {
    await project(page, { calendar: false, optionalFailure: true });
    await expect(page.locator(".schedule-support-note")).toBeVisible();
    await expect(page.locator(".gantt-today")).toHaveCount(0);
    await expect(page.locator(".gantt-weekend")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Hôm nay", exact: true })).toBeDisabled();
    await expect(page.getByRole("link", { name: "Lịch làm việc dự án" })).toHaveAttribute("href", "/calendar?projectId=37");
    await expect(page.locator(".schedule-calendar-note")).toContainText("ngày làm việc tương đối");
});
