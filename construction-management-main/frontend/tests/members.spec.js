import { expect,test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const baseData={
  project:{ id:37,name:"Chung cư Riverside" },current_user_id:1,can_manage:true,
  roles:["admin","project_manager","engineer","worker","accountant","viewer"],
  members:[
    { id:1,fullname:"Trần Văn Hùng",email:"hung@site.test",role:"admin",team:"Ban điều hành",status:"active",last_login_at:"2026-10-05T08:00:00Z" },
    { id:2,fullname:"Nguyễn Hoàng Nam",email:"nam@site.test",role:"engineer",team:"Giám sát hiện trường",status:"active",last_login_at:null },
    { id:3,fullname:"Vũ Đức Long",email:"long@site.test",role:"worker",team:"Đội thi công cọc",status:"locked",last_login_at:"2026-10-04T08:00:00Z" }
  ],
  invitations:[{ id:9,email:"moi@site.test",role:"engineer",invited_by_name:"Trần Văn Hùng",created_at:"2026-10-05T08:00:00Z" }]
};

async function mockMembers(page,{ status=200,data=baseData }={}) {
  const calls=[]; let current=structuredClone(data);
  await page.route("**/projects/37/**",async (route)=>{
    const request=route.request(),path=new URL(request.url()).pathname,method=request.method(); calls.push({ path,method,body:request.postDataJSON?.() });
    if(status!==200) return route.fulfill({ status,json:{ message:status===403 ? "Bạn không có quyền truy cập dự án này":"Không thể tải thành viên" } });
    if(path==="/projects/37/members"&&method==="GET") return route.fulfill({ json:current });
    if(path==="/projects/37/members"&&method==="POST") { const body=request.postDataJSON(); current.invitations=[{ id:10,email:body.email,role:body.role,invited_by_name:"Trần Văn Hùng",created_at:new Date().toISOString() },...current.invitations]; return route.fulfill({ status:201,json:{ kind:"invitation",invitation:current.invitations[0] } }); }
    const memberMatch=path.match(/\/members\/(\d+)$/);
    if(memberMatch&&method==="PATCH") { const id=Number(memberMatch[1]),body=request.postDataJSON(); current.members=current.members.map((member)=>member.id===id ? { ...member,role:body.role }:member); return route.fulfill({ json:{ member:current.members.find((member)=>member.id===id) } }); }
    if(memberMatch&&method==="DELETE") { const id=Number(memberMatch[1]); current.members=current.members.filter((member)=>member.id!==id); return route.fulfill({ status:204,body:"" }); }
    if(path.startsWith("/projects/37/invitations/")&&method==="DELETE") { current.invitations=current.invitations.filter((item)=>item.id!==Number(path.split("/").at(-1))); return route.fulfill({ status:204,body:"" }); }
    return route.fulfill({ status:404,json:{ message:"Not found" } });
  });
  await page.goto("/members?projectId=37");
  return calls;
}

test("Members renders real project data, filters, paginates and exports selected rows",async ({ page })=>{
  const calls=await mockMembers(page);
  await expect(page.getByRole("heading",{ name:"Thành viên & phân quyền",exact:true })).toBeVisible();
  await expect(page.locator(".xds-members-demo-label")).toHaveText("3 thành viên");
  await expect(page.getByText("Chung cư Riverside",{ exact:true })).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(4);
  await expect(page.getByRole("link",{ name:"Cây hạng mục",exact:true })).toHaveAttribute("href","/work-items?projectId=37");
  await page.getByRole("combobox",{ name:"Lọc vai trò" }).selectOption("engineer");
  await expect(page.getByRole("row")).toHaveCount(2);
  await page.getByRole("searchbox",{ name:"Tìm kiếm thành viên, email, vai trò" }).fill("nguyen hoang nam");
  await expect(page.getByText("Nguyễn Hoàng Nam",{ exact:true })).toBeVisible();
  await page.getByRole("checkbox",{ name:"Chọn Nguyễn Hoàng Nam" }).check();
  const downloadEvent=page.waitForEvent("download");
  await page.getByRole("button",{ name:"Xuất danh sách" }).click();
  const download=await downloadEvent; expect(download.suggestedFilename()).toBe("thanh-vien-du-an-37.csv");
  const csv=await readFile(await download.path(),"utf8"); expect(csv).toContain("nam@site.test"); expect(csv).not.toContain("hung@site.test");
  expect(calls.every((call)=>call.path.startsWith("/projects/37/"))).toBe(true);
});

test("member invite, role update, removal and invitation cancellation call real API contracts",async ({ page })=>{
  const calls=await mockMembers(page);
  await page.getByRole("button",{ name:"Mời thành viên" }).click();
  let dialog=page.getByRole("dialog"); await dialog.getByLabel("Email thành viên").fill("new@site.test"); await dialog.getByLabel("Vai trò trong dự án").selectOption("worker"); await dialog.getByRole("button",{ name:"Gửi lời mời" }).click();
  await page.getByRole("tab",{ name:"Lời mời chờ xử lý" }).click(); await expect(page.getByRole("tabpanel").getByText("new@site.test",{ exact:true })).toBeVisible();
  await page.getByRole("tab",{ name:"Danh sách thành viên" }).click();
  await page.getByRole("button",{ name:"Thao tác với Nguyễn Hoàng Nam" }).click(); await page.getByRole("button",{ name:"Đổi vai trò Nguyễn Hoàng Nam" }).click(); dialog=page.getByRole("dialog"); await dialog.getByLabel("Vai trò trong dự án").selectOption("project_manager"); await dialog.getByRole("button",{ name:"Lưu vai trò" }).click(); await expect(page.getByRole("row").filter({ hasText:"Nguyễn Hoàng Nam" })).toContainText("Chỉ huy trưởng");
  await page.getByRole("button",{ name:"Thao tác với Vũ Đức Long" }).click(); await page.getByRole("button",{ name:"Gỡ thành viên Vũ Đức Long" }).click(); dialog=page.getByRole("dialog"); await dialog.getByRole("button",{ name:"Xác nhận" }).click(); await expect(page.getByText("Vũ Đức Long",{ exact:true })).toHaveCount(0);
  await page.getByRole("tab",{ name:"Lời mời chờ xử lý" }).click(); await page.getByRole("button",{ name:"Hủy lời mời" }).first().click(); dialog=page.getByRole("dialog"); await dialog.getByRole("button",{ name:"Xác nhận" }).click();
  expect(calls.some((call)=>call.method==="POST"&&call.path==="/projects/37/members")).toBe(true);
  expect(calls.some((call)=>call.method==="PATCH"&&call.path==="/projects/37/members/2")).toBe(true);
  expect(calls.some((call)=>call.method==="DELETE"&&call.path==="/projects/37/members/3")).toBe(true);
  expect(calls.some((call)=>call.method==="DELETE"&&call.path.startsWith("/projects/37/invitations/"))).toBe(true);
});

test("missing project, forbidden state and responsive layout remain usable",async ({ page })=>{
  await page.goto("/members"); await expect(page.getByRole("heading",{ name:"Vui lòng chọn dự án" })).toBeVisible(); await expect(page.getByRole("table")).toHaveCount(0);
  await mockMembers(page,{ status:403 }); await expect(page.getByRole("alert")).toContainText("không có quyền");
  await page.unrouteAll({ behavior:"wait" }); await mockMembers(page);
  for(const width of [1440,1024,390]) { await page.setViewportSize({ width,height:900 }); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); }
  await page.getByRole("button",{ name:"Mở menu" }).click(); await expect(page.getByRole("navigation").getByRole("link",{ name:"Thành viên & phân quyền" })).toBeInViewport();
});

test("Home, Login and Register public routes still render",async ({ page })=>{
  const errors=[]; page.on("pageerror",(error)=>errors.push(error.message));
  await page.route("**/projects",route=>route.fulfill({ json:{ projects:[{ id:37,name:"Chung cư Riverside",member_role:"admin" }],can_create:false } }));
  await page.route("**/auth/me",route=>route.fulfill({ json:{ user:{ id:1,fullname:"Trần Văn Hùng",system_role:"user" } } }));
  await page.route("**/projects/37/overview",route=>route.fulfill({ json:{ project:{ id:37,name:"Chung cư Riverside",member_role:"admin",status:"active",start_date:"2026-10-01" } } }));
  await page.goto("/home?projectId=37"); await expect(page.locator(".xds-dashboard")).toBeVisible(); await expect(page.getByRole("navigation").getByRole("link",{ name:"Thành viên & phân quyền" })).toHaveAttribute("href","/members?projectId=37");
  await page.goto("/login"); await expect(page.getByRole("button",{ name:"Đăng nhập",exact:true })).toBeVisible();
  await page.goto("/register"); await expect(page.getByRole("button",{ name:"Tạo tài khoản",exact:true })).toBeVisible();
  expect(errors).toEqual([]);
});
