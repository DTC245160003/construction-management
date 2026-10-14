import { expect, test } from "@playwright/test";

const tasks = [
    { id: 1, name: "Găng ngắn", es: 0, ef: .01, isCritical: true, percentComplete: 50 },
    { id: 2, name: "Thường ngắn", es: 1, ef: 1.01, isCritical: false },
    { id: 3, name: "Mốc găng", es: 2, ef: 2, isMilestone: true, isCritical: true },
    { id: 4, name: "Găng dài", es: 3, ef: 7, isCritical: true, percentComplete: 100 }
];
async function open(page, data = tasks) {
    await page.route("**/__t31/data", (route) => route.fulfill({ json: { tasks: data, start: 0, end: 10, width: 900 } }));
    await page.goto("/tests/fixtures/gantt.html");
    await expect(page.locator(".gantt-grid")).toHaveAttribute("data-task-count", String(data.length));
}

test("T-32 short bars and milestones retain a non-color critical marker", async ({ page }) => {
    await open(page);
    const critical = page.locator(".gantt-bar-critical");
    await expect(critical).toHaveCount(3);
    await expect(critical.locator(".gantt-critical-marker")).toHaveCount(3);
    await expect(page.locator('.gantt-row[data-task-id="1"] .gantt-bar')).toHaveCSS("overflow", "visible");
    await expect(page.locator('.gantt-row[data-task-id="3"] .gantt-critical-marker')).toHaveText("!");
    await page.addStyleTag({ content: ".gantt { filter: grayscale(1); }" });
    await page.screenshot({ path: test.info().outputPath("critical-grayscale.png") });
    const borders = await page.locator(".gantt-bar").evaluateAll((nodes) => nodes.map((node) => parseFloat(getComputedStyle(node).borderTopWidth)));
    expect(borders[0]).toBeGreaterThan(borders[1]);
    expect(borders[2]).toBeGreaterThan(borders[1]);
});

test("T-32 forced colors and no-background print keep critical tasks distinguishable", async ({ page }) => {
    await open(page);
    await page.emulateMedia({ forcedColors: "active" });
    await expect(page.locator(".gantt-bar-critical").first()).toHaveCSS("border-top-style", "double");
    await page.screenshot({ path: test.info().outputPath("critical-forced-colors.png") });
    await page.emulateMedia({ media: "print", forcedColors: "none" });
    await expect(page.locator(".gantt-bar-critical").first()).toHaveCSS("border-top-style", "double");
    await expect(page.locator(".gantt-critical-marker").first()).toHaveCSS("color", "rgb(17, 17, 17)");
    await page.pdf({ path: test.info().outputPath("critical-black-white.pdf"), landscape: true, format: "A3", printBackground: false });
});

test("T-32 printing a windowed schedule includes every task and restores the viewport afterward", async ({ page }) => {
    const data = Array.from({ length: 150 }, (_, index) => ({ id: index + 1, name: `Công việc ${index + 1}`, es: index % 7, ef: index % 7 + 1, isCritical: index % 2 === 0 }));
    await open(page, data);
    expect(await page.locator(".gantt-row").count()).toBeLessThan(60);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".gantt-row")).toHaveCount(150);
    await expect(page.locator(".gantt-bar-critical")).toHaveCount(75);
    await page.pdf({ path: test.info().outputPath("all-critical-tasks.pdf"), format: "A3", landscape: true, printBackground: false });
    await page.emulateMedia({ media: "screen" });
    await expect(page.locator(".gantt-grid")).toHaveAttribute("data-windowed", "true");
    expect(await page.locator(".gantt-row").count()).toBeLessThan(60);
});
