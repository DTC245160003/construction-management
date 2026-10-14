import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { makeTasks } from "./fixtures/gantt-data.mjs";
test.use({ trace: "off" });

test("T-31 standalone phone fixture works without mocked API or production data", async ({ page }) => {
    await page.goto("/tests/fixtures/gantt.html");
    await expect(page.locator(".gantt-grid")).toHaveAttribute("data-task-count", "500");
    await page.locator(".gantt-scroll").evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await expect(page.locator('.gantt-row[data-task-id="500"]')).toBeVisible();
});


async function mount(page, props) {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/__t31/data", (route) => route.fulfill({ json: props }));
    await page.goto("/tests/fixtures/gantt.html");
    await expect(page.getByRole("region", { name: "Biểu đồ Gantt" }).or(page.getByRole("status")).or(page.getByRole("alert"))).toBeVisible();
    return errors;
}

test("T-31 shows the named cycle when results are absent", async ({ page }) => {
    const message = 'Phát hiện vòng phụ thuộc: Công việc "Đào móng" chờ "Bê tông", Công việc "Bê tông" lại chờ "Đào móng".';
    await mount(page, { tasks: [], cycleMessage: message });
    await expect(page.getByRole("alert")).toHaveText(message);
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.locator(".gantt-bar")).toHaveCount(0);
});

test("T-31 positions every bar using hand-calculated coordinates and preserves duplicate names", async ({ page }) => {
    const tasks = makeTasks(20);
    await mount(page, { tasks, start: 0, end: 100, width: 5600 });
    await expect(page.locator(".gantt-bar")).toHaveCount(tasks.length);
    const actual = await page.locator(".gantt-bar").evaluateAll((nodes) => nodes.map((node) => ({
        left: parseFloat(node.style.left), width: parseFloat(node.style.width)
    })));
    for (let index = 0; index < tasks.length; index++) {
        expect(actual[index].left).toBeCloseTo(tasks[index].es * 56, 6);
        expect(actual[index].width).toBeCloseTo((tasks[index].ef - tasks[index].es) * 56, 6);
    }
    await page.locator(".gantt-task-name").nth(1).click();
    expect(await page.evaluate(() => window.t31Selected.id)).toBe(2);
});

test("T-31 clips bars to the visible range and does not draw nonexistent tasks at day zero", async ({ page }) => {
    const tasks = [
        { id: 1, name: "Cắt trái", es: 0, ef: 12 },
        { id: 2, name: "Cắt phải", es: 18, ef: 30 },
        { id: 3, name: "Ngoài trước", es: 0, ef: 4 },
        { id: 4, name: "Ngoài sau", es: 21, ef: 30 },
        { id: 5, name: "Chưa có kết quả", es: null, ef: null },
        { id: 6, name: "Sai thứ tự", es: 16, ef: 14 },
        { id: 7, name: "Mốc cuối", es: 20, ef: 20 }
    ];
    await mount(page, { tasks, start: 10, end: 20, width: 1000 });
    await expect(page.locator(".gantt-row")).toHaveCount(7);
    const clipped = await page.locator(".gantt-row").evaluateAll((rows) => rows.map((row) => {
        const bar = row.querySelector(".gantt-bar");
        return bar ? { left: parseFloat(bar.style.left), width: parseFloat(bar.style.width) } : null;
    }));
    expect(clipped[0]).toEqual({ left: 0, width: 200 });
    expect(clipped[1]).toEqual({ left: 800, width: 200 });
    expect(clipped.slice(2, 6)).toEqual([null, null, null, null]);
    expect(clipped[6].left).toBe(1000);
});

test("T-31 windowed groups keep selection/dependencies and reset correctly after a filter", async ({ page }) => {
    const tasks = makeTasks(250).map((task, index) => ({ ...task, work_item_id: Math.floor(index / 25) + 1 }));
    const items = Array.from({ length: 10 }, (_, index) => ({ id: index + 1, title: `Hạng mục ${index + 1}`, parent_id: null }));
    const dependencies = tasks.slice(1).map((task, index) => ({ id: index + 1, predecessor_task_id: index + 1, successor_task_id: task.id, dependency_type: "FS" }));
    const props = { tasks, items, dependencies, start: 0, end: 100, width: 5600 };
    await mount(page, props);
    await expect(page.locator(".gantt-grid")).toHaveAttribute("data-row-count", "260");
    await page.locator(".gantt-scroll").evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await expect(page.locator('.gantt-row[data-task-id="250"]')).toBeVisible();
    await page.locator('.gantt-row[data-task-id="250"] .gantt-task-name').click();
    expect(await page.evaluate(() => window.t31Selected.id)).toBe(250);
    await expect(page.locator('.gantt-row[data-task-id="250"]')).toHaveClass(/gantt-row-selected/);
    expect(await page.locator(".gantt-dependency.is-highlighted").count()).toBeGreaterThan(0);
    await page.evaluate((props) => window.t31Render({ ...props, collapsedGroups: props.items.map((item) => String(item.id)) }), props);
    await expect(page.locator(".gantt-group-row")).toHaveCount(10);
    await expect(page.locator(".gantt-row")).toHaveCount(0);
    await page.evaluate((props) => window.t31Render({ ...props, tasks: props.tasks.slice(0, 3), selectedId: null }), props);
    await expect(page.locator(".gantt-row")).toHaveCount(3);
    await expect(page.locator('.gantt-row[data-task-id="1"]')).toBeVisible();
    await expect(page.locator(".gantt-row-selected")).toHaveCount(0);
    expect(await page.locator(".gantt-scroll").evaluate((node) => node.scrollTop)).toBe(0);
});

test("T-31 500 tasks retain geometry, sticky names/header and scrolling on a mobile viewport", async ({ browser }, testInfo) => {
    test.setTimeout(120000);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const client = await context.newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const tasks = makeTasks();
    const errors = await mount(page, { tasks, start: 0, end: 100, width: 5600 });
    await expect(page.locator(".gantt-grid")).toHaveAttribute("data-task-count", "500");
    expect(await page.locator(".gantt-bar").count()).toBeLessThan(60);
    await page.locator(".gantt-scroll").evaluate((node) => { node.scrollTop = 220 * 44; node.scrollLeft = 1400; });
    const name = page.locator('.gantt-row[data-task-id="226"] .gantt-task-name');
    await expect(name).toBeVisible();
    const header = page.locator(".gantt-name-header");
    const nameX = (await name.boundingBox()).x;
    const headerY = (await header.boundingBox()).y;
    await page.locator(".gantt-scroll").evaluate((node) => { node.scrollLeft += 900; node.scrollTop += 44; });
    expect((await name.boundingBox()).x).toBeCloseTo(nameX, 1);
    expect((await header.boundingBox()).y).toBeCloseTo(headerY, 1);
    // Visit every logical row, including the first and last, rather than merely
    // counting 500 DOM nodes which says nothing about geometry or scroll access.
    const ids = new Set();
    for (let offset = 0; offset < 500; offset += 20) {
        await page.locator(".gantt-scroll").evaluate((node, offset) => { node.scrollTop = offset * 44; }, offset);
        await expect(page.locator(`.gantt-row[data-task-id="${Math.min(offset + 1, 500)}"]`)).toHaveCount(1);
        const positions = await page.locator(".gantt-row").evaluateAll((nodes) => nodes.map((node) => {
            const bar = node.querySelector(".gantt-bar");
            return { id: Number(node.dataset.taskId), left: parseFloat(bar.style.left), width: parseFloat(bar.style.width) };
        }));
        for (const actual of positions) {
            ids.add(actual.id);
            expect(actual.left).toBeCloseTo(tasks[actual.id - 1].es * 56, 6);
            expect(actual.width).toBeCloseTo((tasks[actual.id - 1].ef - tasks[actual.id - 1].es) * 56, 6);
        }
    }
    await page.locator(".gantt-scroll").evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await expect(page.locator('.gantt-row[data-task-id="500"]')).toBeVisible();
    const finalRows = await page.locator(".gantt-row").evaluateAll((nodes) => nodes.map((node) => Number(node.dataset.taskId)));
    finalRows.forEach((id) => ids.add(id));
    expect(ids.size).toBe(500);
    const lastBar = page.locator('.gantt-row[data-task-id="500"] .gantt-bar');
    await expect(lastBar).toHaveCSS("left", `${tasks[499].es * 56}px`);
    await expect(lastBar).toHaveCSS("width", `${(tasks[499].ef - tasks[499].es) * 56}px`);
    const measure = async (axis) => page.locator(".gantt-scroll").evaluate(async (node, axis) => {
        const intervals = [];
        let start, previous;
        const maxTop = node.scrollHeight - node.clientHeight;
        const maxLeft = node.scrollWidth - node.clientWidth;
        const verticalDistance = axis === "stress" ? maxTop : Math.min(maxTop, node.clientHeight * 3);
        node.scrollTop = axis === "horizontal" ? Math.min(maxTop, 220 * 44) : 0;
        node.scrollLeft = 0;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await new Promise((resolve) => {
            const frame = (time) => {
                start ??= time;
                if (previous !== undefined) intervals.push(time - previous);
                previous = time;
                const progress = Math.min(1, (time - start) / 2400);
                const sweep = progress <= .5 ? progress * 2 : (1 - progress) * 2;
                if (axis !== "horizontal") node.scrollTop = sweep * verticalDistance;
                if (axis !== "vertical") node.scrollLeft = sweep * maxLeft;
                if (progress < 1) requestAnimationFrame(frame);
                else resolve();
            };
            requestAnimationFrame(frame);
        });
        const sorted = [...intervals].sort((a, b) => a - b);
        return {
            fps: intervals.length * 1000 / intervals.reduce((sum, value) => sum + value, 0),
            p95FrameMs: sorted[Math.floor(sorted.length * .95)], maxFrameMs: Math.max(...intervals),
            frames: intervals.length, intervals, totalRows: 500,
            renderedRows: node.querySelectorAll(".gantt-row").length,
            axis, durationMs: 2400, verticalDistance: axis === "horizontal" ? 0 : verticalDistance,
            horizontalDistance: axis === "vertical" ? 0 : maxLeft,
            userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, cpuSlowdown: 4
        };
    }, axis);
    const metrics = { horizontal: await measure("horizontal"), vertical: await measure("vertical"), stress: await measure("stress") };
    await testInfo.attach("T31-scroll-metrics", { body: JSON.stringify(metrics, null, 2), contentType: "application/json" });
    await writeFile(testInfo.outputPath("scroll-metrics.json"), JSON.stringify(metrics, null, 2));
    await page.locator(".gantt-scroll").evaluate((node) => { node.scrollTop = 0; node.scrollLeft = 0; });
    await expect(page.locator('.gantt-row[data-task-id="1"]')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("500-mobile.png") });
    for (const result of [metrics.horizontal, metrics.vertical]) {
        expect(result.fps, result.axis).toBeGreaterThanOrEqual(30);
        expect(result.p95FrameMs, result.axis).toBeLessThanOrEqual(100);
    }
    expect(errors).toEqual([]);
    await context.close();
});
