const puppeteer = require('puppeteer-core');

async function testQuick() {
  const t0 = Date.now();
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  console.log(`[+${Date.now() - t0}ms] Going to www.tradingref.com with domcontentloaded...`);
  await page.goto('https://www.tradingref.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  
  console.log(`[+${Date.now() - t0}ms] Waiting for #datePicker...`);
  await page.waitForSelector('#datePicker', { timeout: 15000 });
  console.log(`[+${Date.now() - t0}ms] Waiting 4s for Cloudflare token...`);
  await new Promise(r => setTimeout(r, 4000));
  
  console.log(`[+${Date.now() - t0}ms] Ready! Testing DataManager...`);
  const result = await page.evaluate(async () => {
    try {
      // @ts-ignore
      await DataManager.loadEditions('2026-09-15');
      // @ts-ignore
      AppState.selectedDate = '2026-09-15';
      // @ts-ignore
      AppState.selectedLanguage = 'english';
      // @ts-ignore
      AppState.selectedNewspaper = 'Business Standard English';
      // @ts-ignore
      AppState.selectedEdition = 'Delhi';
      // @ts-ignore
      const url = DataManager.getEditionUrl();
      const rawRes = await fetch(url);
      const rawJson = await rawRes.json();
      return { ok: true, url, rawJson };
    } catch (e) {
      return { ok: false, err: e.message || String(e) };
    }
  });

  console.log(`[+${Date.now() - t0}ms] Result:`, result);
  await browser.close();
}

testQuick().catch(console.error);
