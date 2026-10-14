process.chdir(require('node:path').resolve(__dirname, '../../frontend'));
const {chromium}=require(require.resolve('playwright', { paths: [require('node:path').resolve(__dirname, '../../frontend')] }));
(async()=>{
 const browser=await chromium.launch({channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000},reducedMotion:'reduce'});
  await page.request.post('http://127.0.0.1:5175/auth/login',{data:{email:'admin@e2e.test',password:'Operations-only-E2E-123!'}});
  await page.goto('http://127.0.0.1:5175/projects?projectId=1&q=e2e');
  await page.getByRole('button',{name:'Chi tiết',exact:true}).click();
  await page.locator('.project-detail-stats').waitFor();
  await page.locator('.project-detail-managers').waitFor();
  await page.getByRole('dialog').getByRole('button',{name:'Đóng',exact:true}).last().click();
  await page.getByLabel('Tìm kiếm dự án',{exact:true}).fill('');
  await page.getByLabel('Sắp xếp dự án').selectOption('name');
  await page.screenshot({path:'../docs/visual-review/projects/desktop-full.png',fullPage:true,animations:'disabled'});
  await page.getByLabel('Tìm kiếm dự án',{exact:true}).fill('e2e');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:'../docs/visual-review/projects/mobile-full.png',fullPage:true,animations:'disabled'});
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
