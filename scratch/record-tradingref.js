const puppeteer = require('puppeteer-core');

async function recordTradingRef() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('api/') || url.includes('tradingref')) {
      try {
        const ct = res.headers()['content-type'] || '';
        if (ct.includes('json') || url.includes('/api/')) {
          const body = await res.text().catch(() => '');
          console.log('RESPONSE:', res.status(), url, body.slice(0, 100));
        }
      } catch {}
    }
  });

  console.log('Navigating to tradingref.com...');
  await page.goto('https://www.tradingref.com/', { waitUntil: 'networkidle2', timeout: 30000 });

  console.log('Loaded. Now selecting date 2026-09-15...');
  await page.evaluate(async () => {
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
    const editionData = await DataManager.loadEditionData();
    console.log('editionData:', editionData);
    return editionData;
  });

  const result = await page.evaluate(() => {
    // @ts-ignore
    return DataManager.parsedEditionData;
  });

  console.log('Final parsedEditionData:', result);
  await browser.close();
}

recordTradingRef().catch(console.error);
