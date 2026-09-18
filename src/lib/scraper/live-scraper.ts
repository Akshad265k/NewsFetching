import fs from 'fs';
import path from 'path';
import os from 'os';
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
  // Linux / Docker / Cloud
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
  throw new Error('Chrome/Chromium executable not found. Set CHROME_PATH or run in a compatible environment.');
}

async function launchScraperBrowser(): Promise<Browser> {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (isServerless) {
    // Dynamic import to avoid bundling issues in local dev
    const chromium = (await import('@sparticuz/chromium')).default;
    const executablePath = await chromium.executablePath();
    return await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 800 },
      executablePath,
      headless: true,
    });
  }

  const execPath = getExecutablePath();
  return await puppeteer.launch({
    executablePath: execPath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--disable-gpu',
    ],
  });
}

const translationMap: Record<string, string> = {};
for (let i = 0; i < REVERSED_ALPHABET.length; i++) {
  translationMap[REVERSED_ALPHABET[i]] = ALPHABET[i];
}

function decryptString(obfuscated: string): string {
  if (obfuscated.includes('q!')) return obfuscated;
  return obfuscated
    .split('')
    .map(char => translationMap[char] || char)
    .join('');
}

export function readSnapshotFile(cleanDate: string): NewspaperData | null {
  const rootDir = path.join(process.cwd(), 'resources', 'tradingref-data', 'json-snapshots');
  const tmpDir = path.join(os.tmpdir(), 'vartta-kosha-snapshots');

  const candidates = [
    path.join(tmpDir, `${cleanDate}.json`),
    path.join(rootDir, `${cleanDate}.json`),
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          return parsed as NewspaperData;
        }
      } catch {}
    }
  }

  return null;
}

export function writeSnapshotFile(cleanDate: string, data: any): void {
  const rootDir = path.join(process.cwd(), 'resources', 'tradingref-data', 'json-snapshots');
  const tmpDir = path.join(os.tmpdir(), 'vartta-kosha-snapshots');
  const serialized = JSON.stringify(data, null, 2);

  // 1. Try writing to rootDir (works in local dev & Docker/VPS)
  try {
    if (!fs.existsSync(rootDir)) {
      fs.mkdirSync(rootDir, { recursive: true });
    }
    fs.writeFileSync(path.join(rootDir, `${cleanDate}.json`), serialized, 'utf-8');
    return;
  } catch {}

  // 2. Fallback to /tmp (works in Vercel serverless functions with read-only root)
  try {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    fs.writeFileSync(path.join(tmpDir, `${cleanDate}.json`), serialized, 'utf-8');
  } catch (err) {
    console.warn('Could not write snapshot to /tmp:', err);
  }
}

/**
 * Dynamically fetches the newspaper and edition directory for a date from TradingRef
 */
export async function fetchLiveDateManifest(dateStr: string): Promise<NewspaperData | null> {
  const cleanDate = dateStr.replace(/-/g, '');
  const formattedDate = `${cleanDate.slice(0, 4)}-${cleanDate.slice(4, 6)}-${cleanDate.slice(6, 8)}`;
  
  // 1. Check disk snapshot cache first (supports local files and /tmp on Vercel)
  const cached = readSnapshotFile(cleanDate);
  if (cached) return cached;

  // 2. Fetch on-demand via headless browser
  let browser: Browser | null = null;
  try {
    browser = await launchScraperBrowser();
    const page = await browser.newPage();

    await page.goto('https://tradingref.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('#datePicker', { timeout: 15000 });

    const editionsData = await page.evaluate(async (dateToLoad: string) => {
      const formatted = dateToLoad.replace(/-/g, '');
      
      // Try /api/editions
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

    if (editionsData && typeof editionsData === 'object' && Object.keys(editionsData).length > 0) {
      writeSnapshotFile(cleanDate, editionsData);
      return editionsData as NewspaperData;
    }

  } catch (error) {
    console.error(`Live date scraper error for ${dateStr}:`, error);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
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
  const cached = readSnapshotFile(cleanDate);
  if (cached) {
    const cachedObfuscated = 
      cached[language]?.[newspaper]?.[edition] ||
      cached[normalizedLang]?.[newspaper]?.[edition];
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
  }

  // 2. Fetch on-demand via headless browser
  let browser: Browser | null = null;
  try {
    browser = await launchScraperBrowser();
    const page = await browser.newPage();
    await page.goto('https://tradingref.com/', { waitUntil: 'networkidle2', timeout: 25000 });

    const rawData = await page.evaluate(
      async (d: string, lang: string, paper: string, ed: string) => {
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
    }

    if (entryResult && entryResult.pages.length > 0) {
      // Persist to snapshot cache
      try {
        const currentData = readSnapshotFile(cleanDate);
        if (currentData) {
          const langKey = currentData[language] ? language : (currentData[normalizedLang] ? normalizedLang : language);
          if (currentData[langKey]?.[newspaper]) {
            currentData[langKey][newspaper][edition] = entryResult.raw_decoded ?? '';
            writeSnapshotFile(cleanDate, currentData);
          }
        }
      } catch (saveErr) {
        console.warn('Failed to cache resolved edition:', saveErr);
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
