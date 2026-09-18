const puppeteer = require('puppeteer-core');
const fs = require('fs');

async function testFastScrape() {
  const t0 = Date.now();
  console.log('Testing fast page navigation with ad blocking...');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  
  // Block ads, trackers, images, fonts to make it lightning fast
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const type = req.resourceType();
    if (
      type === 'image' || 
      type === 'font' || 
      type === 'media' ||
      url.includes('doubleclick.net') ||
      url.includes('google-analytics') ||
      url.includes('googletagmanager') ||
      url.includes('cloudflareinsights')
    ) {
      req.abort();
    } else {
      req.continue();
    }
  });

  console.log(`[+${Date.now() - t0}ms] Navigating to www.tradingref.com...`);
  await page.goto('https://www.tradingref.com/', { waitUntil: 'domcontentloaded', timeout: 10000 });
  console.log(`[+${Date.now() - t0}ms] Page loaded! Now fetching /api/getPage...`);

  const result = await page.evaluate(async () => {
    const url = '/api/getPage/20260915/english/' + encodeURIComponent('Business Standard English') + '/' + encodeURIComponent('Delhi');
    const r = await fetch(url);
    if (r.ok) {
      const j = await r.json();
      return j;
    }
    return { error: r.status };
  });

  console.log(`[+${Date.now() - t0}ms] Result:`, JSON.stringify(result).slice(0, 200));
  await browser.close();
  console.log(`Total time: ${Date.now() - t0}ms`);
}

testFastScrape().catch(console.error);
