process.chdir(require('node:path').resolve(__dirname, '../../frontend'));
const { chromium } = require(require.resolve('playwright', { paths: [require('node:path').resolve(__dirname, '../../frontend')] }));
(async () => {
  const browser = await chromium.launch({channel:'msedge'});
  try {
    const page = await browser.newPage({viewport:{width:1600,height:1000}});
    const failures=[]; page.on('pageerror',e=>failures.push(e.message));
    const login=await page.request.post('http://127.0.0.1:5175/auth/login',{data:{email:'admin@e2e.test',password:'Operations-only-E2E-123!'}});
    if(!login.ok()) throw new Error('login failed');
    const existing=(await (await page.request.get('http://127.0.0.1:5175/projects',{headers:{accept:'application/json'}})).json()).projects;
    const fixtures=[['QA · Khu nhà ở An Phú','Thủ Đức, TP. Hồ Chí Minh','active'],['QA · Nhà máy Bình Dương','Khu công nghiệp VSIP, Bình Dương','planned'],['QA · Trung tâm thương mại','Cầu Giấy, Hà Nội','completed'],['QA · Cầu đường ven sông','Hải Châu, Đà Nẵng','on_hold'],['QA · Trường học mới','Biên Hòa, Đồng Nai','active']];
    for(const [name,location,status] of fixtures){
      if(existing.some(p=>p.name===name)) continue;
      const response=await page.request.post('http://127.0.0.1:5175/projects',{data:{name,location,start_date:'2026-10-05'}});
      if(!response.ok()) throw new Error('create: '+await response.text());
      const {project}=await response.json();
      await page.request.patch(`http://127.0.0.1:5175/projects/${project.id}/overview`,{data:{name,location,start_date:'2026-10-05',status}});
    }
    await page.goto('http://127.0.0.1:5175/projects?projectId=1');
    await page.locator('.ops-project-card').first().waitFor();
    await page.screenshot({path:'test-results/projects-desktop-first.png',fullPage:true});
    await page.getByRole('button',{name:'Tạo dự án',exact:true}).click();
    await page.screenshot({path:'test-results/projects-modal-first.png',fullPage:true});
    await page.getByRole('button',{name:'Hủy',exact:true}).click();
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'test-results/projects-mobile-first.png',fullPage:true});
    console.log(JSON.stringify({pageErrors:failures,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
