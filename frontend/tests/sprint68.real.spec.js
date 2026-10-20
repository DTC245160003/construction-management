import { expect,test } from "@playwright/test";
import process from "node:process";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

// This suite requires a real, isolated PostgreSQL API. No routes are intercepted.
test.skip(!process.env.OPERATIONS_REAL_E2E,"Requires an isolated PostgreSQL Sprint 6–8 E2E server");
const password = process.env.SPRINT68_E2E_PASSWORD || "Operations-only-E2E-123!";
const evidence = { name:"bang-chung-khong-exif.jpg",mimeType:"image/jpeg",buffer:Buffer.from("/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABv/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AIABqGv/2Q==","base64") };
async function login(page,role = "admin") {
  const response = await page.request.post("/auth/login",{ data:{ email:process.env[`SPRINT68_E2E_${role.toUpperCase()}_EMAIL`] || `${role}@e2e.test`,password } });
  expect(response.status()).toBe(200);
}
async function requestJson(page,method,path,data) {
  const response = await page.request[method](path,data === undefined ? {} : { data });
  expect(response.ok(),`${method.toUpperCase()} ${path}: ${await response.text()}`).toBe(true);
  return response.json();
}
async function projectFixture(page,label) {
  await login(page);
  const { project } = await requestJson(page,"post","/projects",{ name:`Sprint 6–8 ${label} ${Date.now()}`,location:"Công trường kiểm thử riêng",start_date:"2026-10-05" });
  const base = `/projects/${project.id}`;
  const { item:parent } = await requestJson(page,"post",`${base}/items`,{ title:"Phần móng",parentId:null });
  const { item:first } = await requestJson(page,"post",`${base}/items`,{ title:"Bê tông móng",parentId:parent.id });
  const { item:second } = await requestJson(page,"post",`${base}/items`,{ title:"Cốt thép móng",parentId:parent.id });
  return { projectId:project.id,base,parent,first,second };
}
async function saveDialog(page,label = "Lưu") {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button",{ name:label,exact:true }).click();
  await expect(dialog).toHaveCount(0);
}
async function transition(page,row,action,reason) {
  await row.getByRole("button",{ name:action,exact:true }).click();
  if (reason) await page.getByRole("dialog").getByLabel("Lý do trả lại").fill(reason);
  await saveDialog(page,action === "Duyệt" ? "Duyệt phiếu" : action === "Trả lại" ? "Trả lại phiếu" : action);
}
async function createAcceptance(page,itemId,period,cumulative,{ photo = false } = {}) {
  await page.getByRole("button",{ name:"＋ Lập phiếu nghiệm thu",exact:true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Hạng mục",{ exact:true }).selectOption(String(itemId));
  await dialog.getByLabel("Kỳ / đợt nghiệm thu").fill(period);
  await dialog.getByLabel("Ngày nghiệm thu").fill("2026-10-10");
  await dialog.getByLabel("Lũy kế hiện tại").fill(cumulative);
  if (photo) {
    await dialog.locator('input[type="file"]').setInputFiles(evidence);
    await expect(dialog.getByText("Ảnh đính kèm (1)")).toBeVisible();
  }
  await saveDialog(page);
  return page.getByRole("row").filter({ hasText:period });
}

test("real contract rollup, photo review, payment return/reuse, exact retention, PDF and role protection",async ({ page }) => {
  const errors = []; page.on("pageerror",(error) => errors.push(error.message));
  const { projectId,base,parent,first,second } = await projectFixture(page,"thanh toán");
  await page.goto(`/acceptance?projectId=${projectId}`);
  await page.getByRole("tab",{ name:"Khối lượng hợp đồng" }).click();
  const contractRow = page.getByRole("row").filter({ hasText:first.title });
  await contractRow.getByRole("button",{ name:"Khai báo",exact:true }).click();
  await page.getByRole("dialog").getByLabel("Khối lượng hợp đồng",{ exact:true }).fill("100");
  await page.getByRole("dialog").getByLabel("Đơn vị",{ exact:true }).fill("m³");
  await page.getByRole("dialog").getByLabel("Đơn giá (₫)").fill("1.01");
  await saveDialog(page);
  await requestJson(page,"put",`${base}/contracts/${second.id}`,{ quantity:"200",unit:"kg",unit_price:"2.02",revision:0 });
  await page.reload(); await page.getByRole("tab",{name:"Khối lượng hợp đồng",exact:true}).click();
  const parentRow = page.getByRole("row").filter({ hasText:parent.title });
  await expect(parentRow).toContainText("505,00");
  await expect(parentRow.getByRole("button")).toHaveCount(0);
  await page.getByRole("tab",{ name:"Phiếu nghiệm thu",exact:true }).click();
  const acceptance = await createAcceptance(page,first.id,"NT đợt 1 — kiểm thử thật","10",{ photo:true });
  await acceptance.getByRole("button",{ name:"Chi tiết",exact:true }).click();
  await expect(page.getByRole("dialog").getByRole("region",{ name:"Đối chiếu bằng chứng ảnh" })).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Độ tin cậy của dấu hiệu");
  await page.getByRole("dialog").getByRole("button",{ name:"Đóng",exact:true }).click();
  await transition(page,acceptance,"Trình duyệt"); await transition(page,acceptance,"Duyệt");
  await expect(acceptance).toContainText("Đã duyệt");
  await expect(acceptance.getByRole("button",{ name:"Sửa",exact:true })).toHaveCount(0);

  await page.goto(`/payments?projectId=${projectId}`);
  await page.getByRole("button",{ name:"Cấu hình tạm giữ",exact:true }).click();
  await page.getByRole("dialog").getByLabel("Tỷ lệ tạm giữ theo hợp đồng (%)").fill("10"); await saveDialog(page);
  async function payment(period) {
    await page.getByRole("button",{ name:"＋ Tạo đề nghị thanh toán",exact:true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Kỳ thanh toán").fill(period);
    await expect(dialog.getByLabel("Tỷ lệ tạm giữ (%)")).toHaveValue("10.00");
    await expect(dialog.getByLabel("Tỷ lệ tạm giữ (%)")).toHaveAttribute("readonly","");
    await dialog.getByRole("checkbox",{ name:/NT đợt 1/ }).check(); await saveDialog(page);
    return page.getByRole("row").filter({ hasText:period });
  }
  const returned = await payment("Đề nghị trả lại");
  await transition(page,returned,"Trình duyệt"); await transition(page,returned,"Trả lại","Bổ sung chứng từ đối chiếu");
  const paid = await payment("Đề nghị sau khi giải phóng");
  await expect(paid.locator("td").nth(2)).toHaveText("10,10");
  await expect(paid.locator("td").nth(3)).toContainText("1,01");
  await expect(paid.locator("td").nth(4)).toHaveText("9,09");
  await transition(page,paid,"Trình duyệt"); await transition(page,paid,"Duyệt");
  await expect(paid.getByRole("button",{ name:"Sửa",exact:true })).toHaveCount(0);
  const data = await requestJson(page,"get",`${base}/payments`);
  expect(data.retention_summary).toMatchObject({ gross:"10.10",retained:"1.01",net:"9.09" });
  const original = data.acceptances.find((form) => form.period === "NT đợt 1 — kiểm thử thật");
  const duplicate = await page.request.post(`${base}/payments`,{ data:{ period:"Trùng phiếu",day:"2026-10-10",retention_rate:"10",acceptance_ids:[original.id] } });
  expect(duplicate.status()).toBe(409);

  await page.goto(`/reports?projectId=${projectId}`);
  await expect(page.getByText("Chưa chốt kế hoạch gốc",{ exact:true }).first()).toBeVisible();
  await page.locator(".ops-toolbar select").selectOption(String(first.id));
  const pending = page.waitForEvent("download"); await page.getByRole("button",{ name:"Tải hồ sơ PDF",exact:true }).click();
  const download = await pending; const bytes = await readFile(await download.path());
  expect(bytes.subarray(0,5).toString()).toBe("%PDF-"); expect(bytes.length).toBeGreaterThan(5000);
  await page.setViewportSize({ width:390,height:844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path:test.info().outputPath("sprint68-reports-mobile.png"),fullPage:true });
  await requestJson(page,"post",`${base}/members`,{ email:process.env.SPRINT68_E2E_WORKER_EMAIL || "worker@e2e.test",role:"worker" });
  await login(page,"worker"); await page.goto(`/payments?projectId=${projectId}`);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("link",{ name:"Thanh toán",exact:true })).toHaveCount(0);
  expect((await page.request.get(`${base}/payments`)).status()).toBe(403);
  expect(errors).toEqual([]);
});

test("real signed acceptance adjustment, budget history, parent warning, CSV template and pending allocation",async ({ page }) => {
  const { projectId,base,parent,first } = await projectFixture(page,"chi phí");
  await requestJson(page,"put",`${base}/contracts/${first.id}`,{ quantity:"100",unit:"m³",unit_price:"1.00",revision:0 });
  await page.goto(`/acceptance?projectId=${projectId}`);
  const original = await createAcceptance(page,first.id,"NT trước điều chỉnh","20");
  await transition(page,original,"Trình duyệt"); await transition(page,original,"Duyệt");
  await original.getByRole("button",{ name:"Điều chỉnh",exact:true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Kỳ / đợt nghiệm thu").fill("Điều chỉnh giảm sau đo lại");
  await dialog.getByLabel("Lũy kế hiện tại").fill("18");
  await dialog.getByLabel("Lý do điều chỉnh").fill("Đo lại tại hiện trường giảm 2 m³");
  await expect(dialog).toContainText("-2 m³"); await saveDialog(page);
  const corrected = page.getByRole("row").filter({ hasText:"Điều chỉnh giảm sau đo lại" });
  await transition(page,corrected,"Trình duyệt"); await transition(page,corrected,"Duyệt");
  const acceptances = await requestJson(page,"get",`${base}/acceptance`);
  const originalData = acceptances.forms.find((form) => form.period === "NT trước điều chỉnh");
  const adjustment = acceptances.forms.find((form) => form.period === "Điều chỉnh giảm sau đo lại");
  expect(originalData.cumulative).toBe("20.0000"); expect(adjustment.adjustment_of).toBe(originalData.id);
  expect(acceptances.contracts.find((contract) => contract.work_item_id === first.id).approved_quantity).toBe("18.0000");

  await page.goto(`/costs-materials?projectId=${projectId}`);
  const leaf = page.getByRole("row").filter({ hasText:first.title });
  await leaf.getByRole("button",{ name:"Dự toán",exact:true }).click();
  await page.getByRole("dialog").getByLabel("Giá trị dự toán (₫)").fill("100"); await saveDialog(page);
  await page.getByRole("tab",{ name:"Thực chi",exact:true }).click();
  await page.getByRole("button",{ name:"Import CSV",exact:true }).click();
  await expect(page.getByRole("dialog").getByRole("link",{ name:"Tải mẫu CSV",exact:true })).toHaveAttribute("download","mau-thuc-chi.csv");
  await page.getByRole("dialog").getByLabel("Nội dung CSV").fill(`day,amount,type,work_item_id,notes\n2026-10-10,90,Vật tư,${first.id},Có hạng mục\n2026-10-10,5,Vận chuyển,,Chờ phân bổ`);
  await saveDialog(page);
  await page.getByRole("checkbox",{ name:"Chỉ hiện khoản chờ phân bổ" }).check();
  const unallocated = page.getByRole("row").filter({ hasText:"Vận chuyển" });
  await expect(unallocated).toContainText("Chờ phân bổ");
  await unallocated.getByRole("button",{ name:"Phân bổ",exact:true }).click();
  await page.getByRole("dialog").getByLabel("Hạng mục lá").selectOption(String(first.id)); await saveDialog(page);
  await expect(unallocated).toHaveCount(0);
  await page.getByRole("tab",{ name:"Dự toán",exact:true }).click();
  await expect(leaf).toContainText("Chi cao, nghiệm thu thấp");
  await expect(page.getByRole("row").filter({ hasText:parent.title })).toContainText("Chi cao, nghiệm thu thấp");
  await leaf.getByRole("button",{ name:"Dự toán",exact:true }).click();
  await page.getByRole("dialog").getByLabel("Giá trị dự toán (₫)").fill("120"); await saveDialog(page);
  await leaf.getByRole("button",{ name:"Lịch sử",exact:true }).click();
  await expect(page.getByRole("dialog")).toContainText("100,00"); await expect(page.getByRole("dialog")).toContainText("120,00");
  await page.getByRole("dialog").getByRole("button",{ name:"Đóng",exact:true }).click();
  await page.setViewportSize({ width:390,height:844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path:test.info().outputPath("sprint68-costs-mobile.png"),fullPage:true });
});
