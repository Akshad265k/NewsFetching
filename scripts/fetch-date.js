const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

function getExecutablePath() {
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Neither Chrome nor Edge was found at standard Windows paths.');
}

async function fetchDate(targetDateStr) {
  const cleanDate = targetDateStr.replace(/-/g, '');
  const formattedDate = `${cleanDate.slice(0, 4)}-${cleanDate.slice(4, 6)}-${cleanDate.slice(6, 8)}`;
  
  console.log(`\n======================================================`);
  console.log(`🗞️  Vartta Kosha - Automated Newspaper Fetcher`);
  console.log(`📅 Target Date: ${formattedDate} (${cleanDate})`);
  console.log(`======================================================\n`);
  
  const execPath = getExecutablePath();
  console.log(`🌐 Using browser: ${execPath}`);

  const browser = await puppeteer.launch({
    executablePath: execPath,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--disable-gpu',
      '--window-size=1280,800',
    ],
  });

  try {
    const page = await browser.newPage();
    
    // Block heavy ad trackers and video/audio to make loading fast
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      const resourceType = req.resourceType();
      if (
        resourceType === 'image' ||
        resourceType === 'media' ||
        resourceType === 'font' ||
        url.includes('doubleclick') ||
        url.includes('googlesyndication') ||
        url.includes('google-analytics') ||
        url.includes('googletagmanager') ||
        url.includes('cloudflareinsights')
      ) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    console.log('⏳ Connecting to tradingref.com...');
    await page.goto('https://tradingref.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Wait for flatpickr input
    console.log('⏳ Waiting for application form...');
    await page.waitForSelector('#datePicker', { timeout: 15000 });

    console.log(`📡 Requesting newspaper editions for ${formattedDate}...`);

    // In tradingref page context, call the edition fetch
    const editionsData = await page.evaluate(async (dateToLoad) => {
      // Direct call via tradingref's native endpoint
      try {
        const formatted = dateToLoad.replace(/-/g, '');
        const res = await fetch(`/editions/${encodeURIComponent(formatted)}`, {
          headers: {
            'Accept': 'application/json, text/plain, */*',
          },
          credentials: 'same-origin',
        });

        if (res.ok) {
          const json = await res.json();
          if (json && typeof json === 'object' && Object.keys(json).length > 0) {
            return json;
          }
        }
      } catch (e) {}

      // Fallback: try DataManager if available
      try {
        if (typeof DataManager !== 'undefined' && typeof DataManager.loadEditions === 'function') {
          await DataManager.loadEditions(dateToLoad);
          return DataManager.editionsData;
        }
      } catch (e) {}

      // Fallback: set flatpickr
      try {
        const dp = document.querySelector('#datePicker');
        if (dp && dp._flatpickr) {
          dp._flatpickr.setDate(dateToLoad, true);
        }
      } catch (e) {}

      return null;
    }, formattedDate);

    // If direct fetch didn't return immediately, wait a bit for DataManager to populate
    let finalData = editionsData;
    if (!finalData || Object.keys(finalData).length === 0) {
      console.log('⏳ Waiting for editions payload from page...');
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 800));
        finalData = await page.evaluate(() => {
          return typeof DataManager !== 'undefined' && DataManager.editionsData && Object.keys(DataManager.editionsData).length > 0
            ? DataManager.editionsData
            : null;
        });
        if (finalData) break;
      }
    }

    if (!finalData || finalData.error || Object.keys(finalData).length === 0) {
      console.error(`\n❌ No newspaper archive available on TradingRef for date: ${formattedDate}`);
      console.error(`💡 Note: TradingRef only stores specific historical dates and recent daily editions.`);
      return false;
    }

    const languages = Object.keys(finalData);
    let paperCount = 0;
    for (const lang of languages) {
      if (typeof finalData[lang] === 'object') {
        paperCount += Object.keys(finalData[lang]).length;
      }
    }

    console.log(`\n🎉 Successfully fetched archive!`);
    console.log(`   - Languages (${languages.length}): ${languages.slice(0, 8).join(', ')}${languages.length > 8 ? '...' : ''}`);
    console.log(`   - Total Newspapers: ${paperCount}`);

    const outputDir = path.join(__dirname, '..', 'resources', 'tradingref-data', 'json-snapshots');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = path.join(outputDir, `${cleanDate}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(finalData, null, 2), 'utf-8');
    console.log(`💾 Saved to: ${outputFile}\n`);
    return true;

  } finally {
    await browser.close();
  }
}

async function run() {
  const dates = process.argv.slice(2);
  if (dates.length === 0) {
    dates.push('20260330');
  }

  for (const d of dates) {
    await fetchDate(d);
  }
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
