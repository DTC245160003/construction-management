import { expect, test } from "@playwright/test";

async function mockProject(page) {
    const items = [
        { id: 1, title: "Hạng mục cha", parent_id: null, depth: 0, status: "todo" },
        { id: 2, title: "Hạng mục lá", parent_id: 1, depth: 1, status: "todo" },
        { id: 3, title: "Hạng mục khác", parent_id: null, depth: 0, status: "todo" }
    ];
    const tasks = ["Đổ bê tông", "Đào móng", "Lắp thép", "Dựng cốp pha", "Nghiệm thu"].map((name, index) => ({
        id: index + 1, name, work_item_id: 3, duration_days: 2
    }));
    const dependencies = [];
    const calls = [];
    let rejectDependency = false;
    await page.route("**/projects/1/**", async (route) => {
        const req = route.request();
        const path = new URL(req.url()).pathname;
        const method = req.method();
        const body = req.postDataJSON();
        // The shared header has its own feed; keep the existing no-N+1
        // assertions scoped to the work-item/task/dependency data below.
        if (path.endsWith("/notifications")) return route.fulfill({ json: { notifications: [], unread_count: 0 } });
        if (path.endsWith("/overview")) return route.fulfill({ json:{ project:{ id:1,member_role:"admin" } } });
        calls.push({ path, method, body });
        const json = (data, status = 200) => route.fulfill({ status, json: data });
        if (method === "GET") {
            if (path.endsWith("/items")) return json({ items });
            if (path.endsWith("/tasks")) return json({ tasks });
            if (path.endsWith("/dependencies")) return json({ dependencies });
        }
        if (method === "POST" && path.endsWith("/tasks")) {
            const task = { id: tasks.length + 1, ...body };
            tasks.push(task);
            return json({ task }, 201);
        }
        if (method === "PATCH") {
            const id = Number(path.split("/").at(-1));
            const index = tasks.findIndex((task) => task.id === id);
            tasks[index] = { ...tasks[index], ...body };
            return json({ task: tasks[index] });
        }
        if (method === "POST" && path.endsWith("/dependencies")) {
            if (rejectDependency) return json({ message: "Cặp công việc trước và sau đã có quan hệ phụ thuộc" }, 409);
            const dependency = { id: dependencies.length + 1, successor_task_id: Number(path.split("/").at(-2)), ...body };
            dependencies.push(dependency);
            return json({ dependency }, 201);
        }
        if (method === "DELETE") return route.fulfill({ status: 204 });
        return json({ message: "Unexpected test request" }, 500);
    });
    await page.goto("/work-items?projectId=1");
    await expect(page.getByText("Hạng mục lá", { exact: true })).toBeVisible();
    return { tasks, dependencies, calls, rejectNextDependency: () => { rejectDependency = true; } };
}

async function openTask(page) {
    await page.locator(".task-tree-row").filter({ hasText: "Đổ bê tông" }).getByRole("button", { name: "Sửa công việc" }).click();
    return page.getByRole("dialog");
}

async function selectPredecessor(page, dialog, name) {
    const input = dialog.getByRole("combobox", { name: "Công việc trước" });
    await input.fill(name);
    await page.locator(".ant-select-item-option-content").filter({ hasText: name }).click();
}

test("T-12 create/edit from tree, only leaves, immediate integer duration validation", async ({ page }) => {
    const state = await mockProject(page);
    const initialReads = state.calls.filter((call) => call.method === "GET");
    const parentRow = page.locator(".work-item-row").filter({ hasText: "Hạng mục cha" });
    await expect(parentRow.getByRole("button", { name: "Thêm công việc" })).toHaveCount(0);
    await page.locator(".work-item-row").filter({ hasText: "Hạng mục lá" }).getByRole("button", { name: "Thêm công việc" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Tên công việc" }).fill("Công việc mới");
    const leafSelect = dialog.getByRole("combobox", { name: "Hạng mục lá" });
    await leafSelect.click();
    await expect(page.locator(".ant-select-item-option-content").filter({ hasText: "Hạng mục cha" })).toHaveCount(0);
    await leafSelect.press("Escape");
    const duration = dialog.getByRole("spinbutton", { name: "Thời lượng (ngày)" });
    for (const invalid of ["0", "-2", "1.5"]) {
        await duration.fill(invalid);
        await expect(dialog.getByText("Thời lượng phải là số nguyên ngày lớn hơn 0", { exact: true })).toBeVisible();
        if (invalid === "0") await page.screenshot({ path: test.info().outputPath("duration-validation.png") });
        await dialog.getByRole("button", { name: "Lưu công việc" }).click();
        expect(state.calls.filter((call) => call.method === "POST")).toHaveLength(0);
    }
    await duration.fill("1");
    await dialog.getByRole("button", { name: "Lưu công việc" }).click();
    await expect(dialog.getByText("Sửa công việc", { exact: true })).toBeVisible();
    expect(state.tasks.at(-1)).toMatchObject({ name: "Công việc mới", work_item_id: 2, duration_days: 1 });
    await dialog.getByRole("textbox", { name: "Tên công việc" }).fill("Công việc đã sửa");
    await dialog.getByRole("spinbutton", { name: "Thời lượng (ngày)" }).fill("3");
    await dialog.getByRole("button", { name: "Lưu công việc" }).click();
    await expect.poll(() => state.tasks.at(-1).name).toBe("Công việc đã sửa");
    expect(state.tasks.at(-1).duration_days).toBe(3);
    // StrictMode mounts twice in Vite development. Only collection endpoints
    // are loaded; creating/editing a task causes no per-task fetches.
    expect(new Set(initialReads.map((call) => call.path))).toEqual(new Set([
        "/projects/1/items", "/projects/1/tasks", "/projects/1/dependencies", "/projects/1/work-item-milestones"
    ]));
    expect(initialReads.length).toBeLessThanOrEqual(8);
    expect(state.calls.filter((call) => call.method === "GET")).toEqual(initialReads);
});

test("T-14 searchable predecessor, four types, signed lag, current list, duplicate and self blocked", async ({ page }) => {
    const state = await mockProject(page);
    const dialog = await openTask(page);
    const predecessor = dialog.getByRole("combobox", { name: "Công việc trước" });
    await predecessor.fill("Đổ bê tông");
    await expect(page.locator(".ant-select-item-option-content")).toHaveCount(0);
    await predecessor.fill("Đào");
    await expect(page.locator(".ant-select-item-option-content")).toHaveText(["Đào móng"]);
    await predecessor.press("Escape");
    const names = ["Đào móng", "Lắp thép", "Dựng cốp pha", "Nghiệm thu"];
    for (const [index, type] of ["FS", "SS", "FF", "SF"].entries()) {
        await selectPredecessor(page, dialog, names[index]);
        await dialog.getByRole("combobox", { name: "Loại quan hệ" }).click();
        await page.locator(".ant-select-item-option-content").getByText(type, { exact: true }).click();
        await dialog.getByRole("spinbutton", { name: "Độ trễ (ngày, có thể âm)" }).fill(String([-2, 0, 3, -1][index]));
        await dialog.getByRole("button", { name: /Thêm quan hệ/ }).click();
        await expect(dialog.getByRole("list", { name: "Quan hệ hiện tại" }).getByRole("listitem")).toHaveCount(index + 1);
    }
    expect(state.dependencies.map((entry) => entry.dependency_type)).toEqual(["FS", "SS", "FF", "SF"]);
    expect(state.dependencies.map((entry) => entry.lag_days)).toEqual([-2, 0, 3, -1]);
    await page.screenshot({ path: test.info().outputPath("task-dependencies.png") });
    await selectPredecessor(page, dialog, "Đào móng");
    await dialog.getByRole("button", { name: /Thêm quan hệ/ }).click();
    await expect(dialog.getByText("Cặp công việc trước và sau đã có quan hệ phụ thuộc", { exact: true })).toBeVisible();
    expect(state.dependencies).toHaveLength(4);
    await dialog.getByRole("button", { name: "Xóa quan hệ" }).first().click();
    await expect(dialog.getByRole("list", { name: "Quan hệ hiện tại" }).getByRole("listitem")).toHaveCount(3);
});

test("T-14 displays duplicate error returned by the API", async ({ page }) => {
    const state = await mockProject(page);
    state.rejectNextDependency();
    const dialog = await openTask(page);
    await selectPredecessor(page, dialog, "Đào móng");
    await dialog.getByRole("button", { name: /Thêm quan hệ/ }).click();
    await expect(dialog.getByRole("alert")).toContainText("Cặp công việc trước và sau đã có quan hệ phụ thuộc");
});

test("T-25 TaskForm shows the backend's named cycle and keeps the dependency list unchanged", async ({ page }) => {
    const state = await mockProject(page);
    const cycleMessage = 'Công việc "Đổ bê tông" chờ "Đào móng", "Đào móng" lại chờ "Đổ bê tông"';
    await page.route("**/projects/1/tasks/1/dependencies", (route) => route.fulfill({
        status: 422, json: { message: cycleMessage, cycle: [{ id: 1, name: "Đổ bê tông" }, { id: 2, name: "Đào móng" }] }
    }));
    const dialog = await openTask(page);
    await selectPredecessor(page, dialog, "Đào móng");
    await dialog.getByRole("button", { name: /Thêm quan hệ/ }).click();
    await expect(dialog.getByRole("alert")).toContainText(cycleMessage);
    await expect(dialog.getByText("Chưa có quan hệ phụ thuộc.")).toBeVisible();
    expect(state.dependencies).toHaveLength(0);
});
