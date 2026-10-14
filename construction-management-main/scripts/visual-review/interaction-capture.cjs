const { resolve } = require('node:path');
const { mkdirSync, writeFileSync } = require('node:fs');
const root = resolve(__dirname, '../..');
const { chromium, expect } = require(require.resolve('@playwright/test', { paths: [resolve(root, 'frontend')] }));

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 960 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const base = 'http://127.0.0.1:5175';
    expect((await page.request.post(base + '/auth/login', { data: { email: 'admin@e2e.test', password: 'Operations-only-E2E-123!' } })).ok()).toBe(true);
    async function capture(route, file) {
      const directory = resolve(root, 'docs/visual-review', route);
      mkdirSync(directory, { recursive: true });
      await page.screenshot({ path: resolve(directory, file + '.png'), animations: 'disabled' });
    }
    await page.goto(base + '/work-items?projectId=1');
    await page.locator('.work-item-title').first().click();
    await expect(page.getByRole('dialog')).toContainText('Thi công móng');
    await expect(page.getByRole('dialog').locator('.wbs-detail-tasks button')).toHaveCount(4);
    await capture('work-items', 'detail-desktop');
    await page.setViewportSize({ width: 375, height: 844 });
    await capture('work-items', 'detail-mobile');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('dialog').getByRole('button', { name: 'Đóng', exact: true }).click();
    await page.goto(base + '/members?projectId=1');
    const menu = page.getByRole('button', { name: 'Thao tác với Kiểm thử admin', exact: true });
    await menu.click();
    await expect(page.getByRole('button', { name: 'Đổi vai trò Kiểm thử admin', exact: true })).toBeInViewport();
    await capture('members', 'actions-mobile');
    await page.keyboard.press('Escape');
    await expect(menu).toBeFocused();
    await expect(page.locator('.visual-row-menu')).toHaveCount(0);
    await page.getByRole('button', { name: 'Xem thành viên Kiểm thử admin', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Ngày tham gia');
    await capture('members', 'detail-mobile');
    await page.getByRole('dialog').getByRole('button', { name: 'Đóng', exact: true }).last().click();
    await page.setViewportSize({ width: 1366, height: 960 });
    await page.goto(base + '/site-photos?projectId=1');
    await page.locator('.ops-photo-card button').first().click();
    await expect(page.getByRole('dialog').locator('.ops-photo-preview')).toBeVisible();
    await capture('site-photos', 'detail-desktop');
    await page.setViewportSize({ width: 375, height: 844 });
    await capture('site-photos', 'detail-mobile');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('dialog').getByRole('button', { name: 'Đóng', exact: true }).click();
    await page.goto(base + '/settings?projectId=1');
    await page.getByRole('navigation', { name: 'Nhóm cài đặt' }).getByRole('link', { name: 'Vị trí công trường', exact: true }).click();
    await expect(page.locator('#settings-location')).toBeInViewport();
    await capture('settings', 'location-mobile');
    expect(errors).toEqual([]);
    writeFileSync(resolve(root, 'docs/visual-review/interaction-results.json'), JSON.stringify({ passed: ['WBS detail and tasks', 'Member menu, Escape, focus and join date', 'Photo preview desktop/mobile', 'Settings section navigation'], errors }, null, 2));
    console.log('Visual interactions passed; console errors: 0');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
