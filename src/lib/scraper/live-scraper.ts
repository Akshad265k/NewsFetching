import fs from 'fs';
import path from 'path';
import puppeteer, { Browser } from 'puppeteer-core';
import { ALPHABET, REVERSED_ALPHABET } from '@/lib/constants';
import type { DecryptedEntry, NewspaperData } from '@/types';

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  // Windows standard paths
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  // Linux / Docker / Cloud (Debian, Ubuntu, Alpine, RHEL)
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  // macOS paths
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

function getExecutablePath(): string {
  for (const p of CHROME_PATHS) {
    if (p && fs.existsSync(p)) return p;
  }
  throw new Error('Chrome/Chromium executable not found. Set CHROME_PATH environment variable or install Chromium.');
}

const translationMap: Record<string, string> = {};
for (let i = 0; i < REVERSED_ALPHABET.length; i++) {
  translationMap[REVERSED_ALPHABET[i]] = ALPHABET[i];
}

function decryptString(obfuscated: string): string {
  return obfuscated
    .split('')
    .map(char => translationMap[char] || char)
    .join('');
}

let activeBrowser: Browser | null = null;
let browserIdleTimer: NodeJS.Timeout | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserIdleTimer) {
    clearTimeout(browserIdleTimer);
    browserIdleTimer = null;
  }

  if (activeBrowser && activeBrowser.connected) {
    return activeBrowser;
  }

  const execPath = getExecutablePath();
  activeBrowser = await puppeteer.launch({
    executablePath: execPath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--disable-gpu',
      '--window-size=1280,800',
    ],
  });

  return activeBrowser;
}

function scheduleBrowserClose() {
  if (browserIdleTimer) clearTimeout(browserIdleTimer);
  browserIdleTimer = setTimeout(async () => {
    if (activeBrowser && activeBrowser.connected) {
      await activeBrowser.close().catch(() => {});
      activeBrowser = null;
    }
  }, 45000); // keep warm for 45s of inactivity
}

/**
 * Dynamically fetches the newspaper and edition directory for a date from TradingRef
 */
export async function fetchLiveDateManifest(dateStr: string): Promise<NewspaperData | null> {
  const cleanDate = dateStr.replace(/-/g, '');
  const formattedDate = `${cleanDate.slice(0, 4)}-${cleanDate.slice(4, 6)}-${cleanDate.slice(6, 8)}`;
  
  // 1. Check disk snapshot cache first
  const snapshotsDir = path.join(process.cwd(), 'resources', 'tradingref-data', 'json-snapshots');
  const cacheFile = path.join(snapshotsDir, `${cleanDate}.json`);
  if (fs.existsSync(cacheFile)) {
    try {
      const content = fs.readFileSync(cacheFile, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && Object.keys(parsed).length > 0) {
        return parsed as NewspaperData;
      }
    } catch {}
  }

  // 2. Fetch on-demand via headless browser
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();

    // Block heavy ad trackers
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

    await page.goto('https://tradingref.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('#datePicker', { timeout: 15000 });

    const editionsData = await page.evaluate(async (dateToLoad: string) => {
      const formatted = dateToLoad.replace(/-/g, '');
      
      // Try /api/editions first
      try {
        const res = await fetch(`/api/editions/${encodeURIComponent(formatted)}`, {
          headers: { 'Accept': 'application/json, text/plain, */*' },
          credentials: 'same-origin',
        });
        if (res.ok) {
          const json = await res.json();
          if (json && typeof json === 'object' && Object.keys(json).length > 0) {
            return json;
          }
        }
      } catch {}

      // Try /editions
      try {
        const res = await fetch(`/editions/${encodeURIComponent(formatted)}`, {
          headers: { 'Accept': 'application/json, text/plain, */*' },
          credentials: 'same-origin',
        });
        if (res.ok) {
          const json = await res.json();
          if (json && typeof json === 'object' && Object.keys(json).length > 0) {
            return json;
          }
        }
      } catch {}

      try {
        // @ts-ignore
        if (typeof DataManager !== 'undefined' && typeof DataManager.loadEditions === 'function') {
          // @ts-ignore
          await DataManager.loadEditions(dateToLoad);
          // @ts-ignore
          return DataManager.editionsData;
        }
      } catch {}

      return null;
    }, formattedDate);

    await page.close().catch(() => {});
    scheduleBrowserClose();

    if (editionsData && typeof editionsData === 'object' && Object.keys(editionsData).length > 0) {
      if (!fs.existsSync(snapshotsDir)) {
        fs.mkdirSync(snapshotsDir, { recursive: true });
      }
      fs.writeFileSync(cacheFile, JSON.stringify(editionsData, null, 2), 'utf-8');
      return editionsData as NewspaperData;
    }

  } catch (error) {
    console.error(`Live date scraper error for ${dateStr}:`, error);
    scheduleBrowserClose();
  }

  return null;
}

/**
 * Dynamically resolves pages for a specific edition on-the-fly
 */
export async function fetchLiveEditionPages(
  dateStr: string,
  language: string,
  newspaper: string,
  edition: string
): Promise<DecryptedEntry | null> {
  const cleanDate = dateStr.replace(/-/g, '');
  const formattedDate = `${cleanDate.slice(0, 4)}-${cleanDate.slice(4, 6)}-${cleanDate.slice(6, 8)}`;
  const normalizedLang = language.toLowerCase();

  // 1. Check disk snapshot cache first
  const snapshotsDir = path.join(process.cwd(), 'resources', 'tradingref-data', 'json-snapshots');
  const cacheFile = path.join(snapshotsDir, `${cleanDate}.json`);
  if (fs.existsSync(cacheFile)) {
    try {
      const content = fs.readFileSync(cacheFile, 'utf-8');
      const parsed = JSON.parse(content);
      const cachedObfuscated = 
        parsed[language]?.[newspaper]?.[edition] ||
        parsed[normalizedLang]?.[newspaper]?.[edition];
      if (typeof cachedObfuscated === 'string' && cachedObfuscated.length > 0) {
        const decoded = decryptString(cachedObfuscated);
        const parts = decoded.split('q!');
        if (parts.length >= 3) {
          const pages = parts[2].split('m%').filter(p => p.trim());
          return {
            type: parts[0] as DecryptedEntry['type'],
            prefix: parts[1],
            pages,
            pages_count: pages.length,
            raw_decoded: decoded,
          };
        }
      }
    } catch {}
  }

  // 2. Fetch on-demand via headless browser
  let browser: Browser | null = null;
  try {
    const execPath = getExecutablePath();
    browser = await puppeteer.launch({
      executablePath: execPath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto('https://tradingref.com/', { waitUntil: 'networkidle2', timeout: 25000 });

    const rawData = await page.evaluate(
      async (d: string, lang: string, paper: string, ed: string) => {
        // Fast direct fetch to /api/getPage
        try {
          const url = `/api/getPage/${d.replace(/-/g, '')}/${encodeURIComponent(lang)}/${encodeURIComponent(paper)}/${encodeURIComponent(ed)}`;
          const r = await fetch(url);
          if (r.ok) {
            const j = await r.json();
            if (j && (j.Data || j.data)) {
              return { directData: j.Data || j.data };
            }
          }
        } catch (e: any) {}

        // Fallback: Flatpickr & UI selection
        try {
          const dp = document.querySelector('#datePicker') as any;
          if (dp && dp._flatpickr) {
            dp._flatpickr.setDate(d, true);
          }
          await new Promise(r => setTimeout(r, 600));

          const langSelect = document.querySelector('#languageSelect') as HTMLSelectElement;
          if (langSelect) {
            langSelect.value = lang.toLowerCase();
            langSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }
          await new Promise(r => setTimeout(r, 600));

          const paperSelect = document.querySelector('#newspaperSelect') as HTMLSelectElement;
          if (paperSelect) {
            const matched = [...paperSelect.options].find(o => 
              o.value.toLowerCase() === paper.toLowerCase() ||
              o.text.toLowerCase() === paper.toLowerCase()
            );
            if (matched) {
              paperSelect.value = matched.value;
              paperSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
          await new Promise(r => setTimeout(r, 600));

          const editionSelect = document.querySelector('#editionSelect') as HTMLSelectElement;
          if (editionSelect) {
            const matchedEd = [...editionSelect.options].find(o => 
              o.value.toLowerCase() === ed.toLowerCase() ||
              o.text.toLowerCase() === ed.toLowerCase()
            );
            if (matchedEd) {
              editionSelect.value = matchedEd.value;
              editionSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
          await new Promise(r => setTimeout(r, 600));

          // @ts-ignore
          if (typeof DataManager !== 'undefined' && typeof DataManager.loadEditionData === 'function') {
            // @ts-ignore
            const parsed = await DataManager.loadEditionData();
            if (parsed && parsed.type && parsed.prefix) {
              return { success: true, parsed };
            }
          }
        } catch (e: any) {
          return { error: e.message };
        }

        return null;
      },
      formattedDate,
      normalizedLang,
      newspaper,
      edition
    );

    let entryResult: DecryptedEntry | null = null;

    if (rawData && rawData.directData) {
      const decoded = decryptString(rawData.directData);
      const parts = decoded.split('q!');
      if (parts.length >= 3) {
        const pages = parts[2].split('m%').filter(p => p.trim());
        entryResult = {
          type: parts[0] as DecryptedEntry['type'],
          prefix: parts[1],
          pages,
          pages_count: pages.length,
          raw_decoded: decoded,
        };
      }
    } else if (rawData && rawData.parsed) {
      const p = rawData.parsed;
      const pages = (p.suffix || '').split('m%').filter((pg: string) => pg.trim());
      entryResult = {
        type: p.type as DecryptedEntry['type'],
        prefix: p.prefix,
        pages,
        pages_count: pages.length,
        raw_decoded: `${p.type}q!${p.prefix}q!${p.suffix}`,
      };
    }

    if (entryResult && entryResult.pages.length > 0) {
      // Persist to local disk snapshot
      try {
        if (fs.existsSync(cacheFile)) {
          const content = fs.readFileSync(cacheFile, 'utf-8');
          const parsed = JSON.parse(content);
          const langKey = parsed[language] ? language : (parsed[normalizedLang] ? normalizedLang : language);
          if (parsed[langKey]?.[newspaper]) {
            parsed[langKey][newspaper][edition] = entryResult.raw_decoded;
            fs.writeFileSync(cacheFile, JSON.stringify(parsed, null, 2), 'utf-8');
          }
        }
      } catch (saveErr) {
        console.warn('Failed to cache resolved edition to disk:', saveErr);
      }

      return entryResult;
    }

  } catch (error) {
    console.error(`Live edition scraper error:`, error);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  return null;
}

