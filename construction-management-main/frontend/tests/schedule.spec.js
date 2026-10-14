import { expect, test } from "@playwright/test";

const schedule = [
    { id: 41, name: "Đào móng", duration_days: 4, work_item_id: 10, es: 0, ef: 4, ls: 0, lf: 4, slack: 0, isCritical: true },
    { id: 42, name: "Chuẩn bị vật tư", duration_days: 2, work_item_id: 11, es: 0, ef: 2, ls: 3, lf: 5, slack: 3, isCritical: false },
    { id: 43, name: "Đổ bê tông", duration_days: 5, work_item_id: 10, es: 4, ef: 9, ls: 4, lf: 9, slack: 0, isCritical: true }
];

test("T-28 renders all CPM fields, relative Vietnamese days and critical-only filter", async ({ page }) => {
    const queries = [];
    await page.route("**/projects/37/schedule*", (route) => {
        const url = new URL(route.request().url());
        queries.push(url.searchParams.get("critical"));
        return route.fulfill({ json: { schedule: url.searchParams.get("critical") === "true"
            ? schedule.filter((task) => task.isCritical) : schedule } });
    });
    await page.goto("/schedule?projectId=37");
    await expect(page.getByRole("heading", { name: "Tiến độ công việc" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.locator(".gantt-row")).toHaveCount(3);
    await expect(page.locator(".gantt-row.is-critical")).toHaveCount(2);
    await expect(page.locator(".gantt-row").filter({hasText:"Đổ bê tông"}).locator(".gantt-bar")).toHaveAttribute("title", /ES 4, EF 9, LS 4, LF 9/);
    for (const title of ["Tên công việc", "Thời lượng", "Khởi sớm (ES)", "Kết sớm (EF)", "Khởi muộn (LS)", "Kết muộn (LF)", "Độ trễ", "Trạng thái"]) {
        await expect(page.getByRole("columnheader", { name: title, exact: true })).toBeVisible();
    }
    const nonCritical = page.getByRole("row").filter({ hasText: "Chuẩn bị vật tư" });
    await expect(nonCritical.getByRole("cell")).toHaveText([
        "Chuẩn bị vật tư", "2 ngày", "Ngày 0", "Ngày 2", "Ngày 3", "Ngày 5", "3 ngày", "Không găng"
    ]);
    await expect(page.getByRole("row").filter({ hasText: "Đào móng" }).getByText("Găng", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Quay lại cây hạng mục" })).toHaveAttribute("href", "/work-items?projectId=37");
    await page.getByRole("checkbox", { name: "Chỉ hiện công việc găng" }).check();
    await expect(nonCritical).toHaveCount(0);
    await expect(page.getByRole("row").filter({ hasText: "Đổ bê tông" })).toBeVisible();
    expect(queries).toContain("true");
    await expect(page.locator(".gantt-row")).toHaveCount(2);
    await page.getByRole("checkbox", { name: "Chỉ hiện công việc găng" }).uncheck();
    await expect(nonCritical).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("schedule.png"), fullPage: true });
});

test("T-28 loading transitions to empty state", async ({ page }) => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route("**/projects/37/schedule*", async (route) => {
        await gate;
        await route.fulfill({ json: { schedule: [] } });
    });
    await page.goto("/schedule?projectId=37");
    await expect(page.getByRole("status")).toHaveText("Đang tải tiến độ…");
    release();
    await expect(page.getByText("Dự án chưa có công việc. Thêm công việc từ cây hạng mục để tính tiến độ.")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await page.getByRole("checkbox", { name: "Chỉ hiện công việc găng" }).check();
    await expect(page.getByText("Không có công việc găng.", { exact: true })).toBeVisible();
});

test("T-28 shows a named cycle alert instead of an empty table", async ({ page }) => {
    const message = 'Phát hiện vòng phụ thuộc: Công việc "Đào móng" chờ "Đổ bê tông", Công việc "Đổ bê tông" lại chờ "Đào móng".';
    await page.route("**/projects/37/schedule*", (route) => route.fulfill({ status: 422, json: {
        message, cycle: [{ id: 41, name: "Đào móng" }, { id: 43, name: "Đổ bê tông" }]
    } }));
    await page.goto("/schedule?projectId=37");
    await expect(page.getByRole("alert")).toContainText(message);
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByText("Dự án chưa có công việc.", { exact: false })).toHaveCount(0);
});

test("T-28 API error can be retried, project switch discards previous data", async ({ page }) => {
    let fail = true;
    await page.route("**/projects/37/schedule*", (route) => fail
        ? route.fulfill({ status: 500, json: { message: "Không thể tính tiến độ" } })
        : route.fulfill({ json: { schedule } }));
    await page.goto("/schedule?projectId=37");
    await expect(page.getByRole("alert")).toHaveText("Không thể tính tiến độ");
    fail = false;
    await page.getByRole("button", { name: "Tải lại" }).click();
    await expect(page.getByRole("table")).toBeVisible();
    await page.route("**/projects/38/schedule*", (route) => route.fulfill({ status: 403, json: { message: "Bạn không có quyền truy cập dự án này" } }));
    await page.goto("/schedule?projectId=38");
    await expect(page.getByRole("alert")).toHaveText("Bạn không có quyền truy cập dự án này");
    await expect(page.getByRole("table")).toHaveCount(0);
});

test("T-28 missing or invalid project does not send API requests", async ({ page }) => {
    const requests = [];
    page.on("request", (request) => {
        if (new URL(request.url()).pathname.startsWith("/projects/")) requests.push(request.url());
    });
    for (const query of ["", "?projectId=0", "?projectId=abc"]) {
        await page.goto(`/schedule${query}`);
        await expect(page.getByRole("alert")).toContainText("Vui lòng chọn dự án hợp lệ");
    }
    expect(requests).toEqual([]);
});
