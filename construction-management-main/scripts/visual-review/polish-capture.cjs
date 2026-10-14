process.chdir(require('node:path').resolve(__dirname, '../../frontend'));
const {chromium,expect}=require(require.resolve('@playwright/test', { paths: [require('node:path').resolve(__dirname, '../../frontend')] }));
const {mkdirSync,writeFileSync}=require('node:fs');
const {resolve}=require('node:path');
const allowed=['projects','members','work-items','schedule','calendar','field-assignments','site-journal','acceptance','payments','costs-materials','site-photos','reports','notifications','audit-logs','settings'];
const phase=process.argv[2]||'before';
const routes=process.argv.slice(3).length?process.argv.slice(3):allowed;
if(!['before','after','final'].includes(phase)||routes.some(route=>!allowed.includes(route))) throw new Error('Invalid capture target');
(async()=>{
 const browser=await chromium.launch({channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:960},reducedMotion:'reduce'});
  const errors=[]; const review=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  const login=await page.request.post('http://127.0.0.1:5175/auth/login',{data:{email:'admin@e2e.test',password:'Operations-only-E2E-123!'}});
  if(!login.ok()) throw new Error('Login failed');
  for(const route of routes){
   const dir=resolve('../docs/visual-review',route); mkdirSync(dir,{recursive:true});
   await page.goto('http://127.0.0.1:5175/'+route+'?projectId=1');
   await expect(page.locator('h1').first()).toBeVisible();
   await expect(page.locator('.visual-skeleton')).toHaveCount(0);
   await expect(page.locator('.ops-shell-project select')).toBeEnabled();
   await page.waitForLoadState('networkidle');
   for(const width of phase==='final'?[1600,1366,768,375]:[1366]){
    await page.setViewportSize({width,height:width===375?844:960});
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:resolve(dir,phase+'-'+width+'.png'),fullPage:width===375,animations:'disabled'});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    const heading=await page.locator('h1').first().textContent();
    review.push({route,width,heading,overflow});
    if(overflow) errors.push(route+' overflow at '+width);
   }
   console.log(route+' captured');
  }
  console.log(JSON.stringify({errors}));
  const subset=routes.length===allowed.length?'':'-'+routes.join('-');
  writeFileSync(resolve('../docs/visual-review',phase+'-review-results'+subset+'.json'),JSON.stringify({review,errors},null,2));
  if(errors.length) throw new Error('Visual browser review failed; inspect the review JSON.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
