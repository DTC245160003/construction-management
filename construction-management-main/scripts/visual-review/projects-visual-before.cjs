process.chdir(require('node:path').resolve(__dirname, '../../frontend'));
const { chromium } = require(require.resolve('playwright', { paths: [require('node:path').resolve(__dirname, '../../frontend')] }));
(async () => {
  const browser = await chromium.launch({channel:'msedge'});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const login = await page.request.post('http://127.0.0.1:5175/auth/login',{data:{email:'admin@e2e.test',password:'Operations-only-E2E-123!'}});
    if (!login.ok()) throw new Error('Login failed: '+login.status());
    for (const route of ['projects','home','members']) {
      await page.goto('http://127.0.0.1:5175/'+route+'?projectId=1');
      await page.waitForTimeout(1200);
      await page.screenshot({path:'test-results/'+route+'-before.png',fullPage:true});
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1)});
