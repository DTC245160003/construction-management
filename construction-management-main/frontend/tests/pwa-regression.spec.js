import { expect,test } from "@playwright/test";
import process from "node:process";

test("public routes render and Vite dependencies load without service-worker failures",async ({ page }) => {
  const failed=[]; const errors=[];
  page.on("requestfailed",(request) => { if (/\/(node_modules\/\.vite|@vite|src)\//.test(new URL(request.url()).pathname)) failed.push(request.url()); });
  page.on("pageerror",(error) => errors.push(error.message));
  await page.goto("/login");
  await expect(page.getByRole("button",{ name:"Đăng nhập",exact:true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("/node_modules/.vite/deps/antd.js")))).toBe(true);
  await page.goto("/register");
  await expect(page.getByRole("button",{ name:"Tạo tài khoản",exact:true })).toBeVisible();
  await page.goto("/home");
  await expect(page.locator("#root")).not.toBeEmpty();
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});

test("Vite development unregisters a previously installed journal worker",async ({ page }) => {
  test.skip(Boolean(process.env.OPERATIONS_REAL_E2E),"Real offline E2E explicitly enables the safe journal worker.");
  await page.goto("/login");
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/journal-sw.js",{ updateViaCache:"none" });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange",resolve,{ once:true }));
  });
  await page.goto("/login");
  await expect(page.getByRole("button",{ name:"Đăng nhập",exact:true })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).filter((registration) =>
    [registration.active,registration.waiting,registration.installing].some((worker) => worker?.scriptURL.endsWith("/journal-sw.js"))).length)).toBe(0);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL.endsWith("/journal-sw.js") || false)).toBe(false);
});

test("enabled journal worker leaves Vite module requests to the network",async ({ page }) => {
  test.skip(!process.env.OPERATIONS_REAL_E2E,"Requires the explicit safe-worker development server.");
  const failed=[]; const errors=[];
  page.on("requestfailed",(request) => { if (/\/(node_modules\/\.vite|@vite|src)\//.test(new URL(request.url()).pathname)) failed.push(request.url()); });
  page.on("pageerror",(error) => errors.push(error.message));
  page.on("console",(message) => { if (message.type()==="error" && /FetchEvent|Failed to convert value to 'Response'|antd\.js/.test(message.text())) errors.push(message.text()); });
  await page.goto("/login");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange",resolve,{ once:true }));
  });
  await page.reload();
  await expect(page.getByRole("button",{ name:"Đăng nhập",exact:true })).toBeVisible();
  const responses=await page.evaluate(async () => Promise.all(["/@vite/client","/src/main.jsx","/node_modules/.vite/deps/antd.js"].map(async (path) => {
    const response=await fetch(path,{ cache:"no-store" });
    return { path,status:response.status,isResponse:response instanceof Response };
  })));
  expect(responses).toEqual(responses.map(({ path }) => ({ path,status:200,isResponse:true })));
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});
