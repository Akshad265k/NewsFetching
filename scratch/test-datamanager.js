const puppeteer = require('puppeteer-core');

async function testDataManagerFlow() {
  const t0 = Date.now();
  console.log('Testing DataManager flow...');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  
  // Block heavy ad networks to speed up navigation, but keep same-origin scripts
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const type = req.resourceType();
    if (
      type === 'image' || 
      type === 'font' || 
      type === 'media' ||
      url.includes('doubleclick.net') ||
      url.includes('googletagmanager.com') ||
      url.includes('google-analytics.com') ||
      url.includes('rubiconproject.com') ||
      url.includes('presage.io') ||
      url.includes('id5-sync.com')
    ) {
      req.abort();
    } else {
      req.continue();
    }
  });

  await page.goto('https://www.tradingref.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  console.log(`[+${Date.now() - t0}ms] DOM loaded! Waiting for DataManager...`);

  await page.waitForFunction(() => typeof window.DataManager !== 'undefined' && typeof window.DataManager.loadEditions === 'function', { timeout: 10000 });
  console.log(`[+${Date.now() - t0}ms] DataManager ready! Calling loadEditions & loadEditionData...`);

  const result = await page.evaluate(async (dateStr, lang, paper, ed) => {
    try {
      await window.DataManager.loadEditions(dateStr);
      window.AppState.selectedDate = dateStr;
      window.AppState.selectedLanguage = lang;
      window.AppState.selectedNewspaper = paper;
      window.AppState.selectedEdition = ed;
      const parsed = await window.DataManager.loadEditionData();
      return { success: true, parsed };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  }, '2026-09-15', 'english', 'Business Standard English', 'Delhi');

  console.log(`[+${Date.now() - t0}ms] Evaluated:`, result);
  await browser.close();
}

testDataManagerFlow().catch(console.error);
