import {test,expect} from '@playwright/test';
test('one Express origin serves React, keeps JSON authentication and caches an offline shell without a database',async({page,context})=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/login');await expect(page.getByRole('button',{name:'Đăng nhập',exact:true})).toBeVisible();
    await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
    const result=await page.evaluate(async()=>{
        const root=await fetch('/',{headers:{Accept:'application/json'}}),projects=await fetch('/projects',{headers:{Accept:'application/json'}});
        const keys=await caches.keys(),paths=[];for(const key of keys)for(const req of await(await caches.open(key)).keys())paths.push(new URL(req.url).pathname);
        return{root:await root.json(),projectStatus:projects.status,projectType:projects.headers.get('content-type'),paths};
    });
    expect(result.root).toEqual({message:'Construction Management API running'});expect(result.projectStatus).toBe(401);expect(result.projectType).toContain('application/json');
    expect(result.paths).toContain('/');expect(result.paths).toContain('/site-journal');expect(result.paths.some(path=>path.startsWith('/auth')||path.startsWith('/projects'))).toBe(false);
    await page.goto('/reports?projectId=234');await expect(page.locator('#root')).not.toBeEmpty();
    await context.setOffline(true);await page.goto('/site-journal');await expect(page.getByRole('heading',{name:'Chọn dự án để tiếp tục',exact:true})).toBeVisible();
    expect(errors).toEqual([]);
});
