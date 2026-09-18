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
 * Dynamically fetches the newspaper and edition directory for a date from TradingRef.
 * Uses direct HTTP fetch to the /api/editions endpoint — no headless browser needed.
 */
export async function fetchLiveDateManifest(dateStr: string): Promise<NewspaperData | null> {
  const cleanDate = dateStr.replace(/-/g, '');

  // 1. Check disk snapshot cache first (supports local files and /tmp on Vercel)
  const cached = readSnapshotFile(cleanDate);
  if (cached) return cached;

  // 2. Direct HTTP fetch to TradingRef's /api/editions endpoint (fast, no browser needed)
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(
        `https://www.tradingref.com/api/editions/${encodeURIComponent(cleanDate)}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://www.tradingref.com/',
          },
          signal: controller.signal,
          cache: 'no-store',
        }
      );
      clearTimeout(timeoutId);

      if (response.ok) {
        const editionsData = await response.json();
        if (editionsData && typeof editionsData === 'object' && Object.keys(editionsData).length > 0) {
          writeSnapshotFile(cleanDate, editionsData);
          return editionsData as NewspaperData;
        }
      }

      // If we got a non-ok response, no point retrying
      if (response.status >= 400 && response.status < 500) break;

    } catch (error) {
      console.warn(`Live manifest fetch attempt ${attempt}/${maxRetries} for ${dateStr}:`, error instanceof Error ? error.message : error);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 500 * attempt));
      }
    }
  }

  return null;
}


/**
 * Dynamically resolves pages for a specific edition on-the-fly.
 */
export async function fetchLiveEditionPages(
  dateStr: string,
  language: string,
  newspaper: string,
  edition: string
): Promise<DecryptedEntry | null> {
  const cleanDate = dateStr.replace(/-/g, '');
  const normalizedLang = language.toLowerCase();

  // 1. Check disk snapshot cache first
  const cached = readSnapshotFile(cleanDate);
  if (cached) {
    const cachedObfuscated = 
      cached[language]?.[newspaper]?.[edition] ||
      cached[normalizedLang]?.[newspaper]?.[edition];
    if (typeof cachedObfuscated === 'string' && cachedObfuscated.length > 0) {
      const decoded = cachedObfuscated.includes('q!') ? cachedObfuscated : decryptString(cachedObfuscated);
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

  // Helper: persist a resolved entry back to the snapshot cache
  function persistToCache(entryResult: DecryptedEntry) {
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
  }

  // 2. Resolve via headless browser by driving TradingRef's DataManager
  let browser: Browser | null = null;
  try {
    browser = await launchScraperBrowser();
    const page = await browser.newPage();

    // Block non-essential heavy ad networks to speed up loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      const type = req.resourceType();
      if (
        type === 'image' || type === 'font' || type === 'media' ||
        url.includes('doubleclick.net') || url.includes('googletagmanager.com') ||
        url.includes('google-analytics.com') || url.includes('rubiconproject.com') ||
        url.includes('presage.io') || url.includes('id5-sync.com') ||
        url.includes('cloudflareinsights')
      ) {
        req.abort().catch(() => {});
      } else {
        req.continue().catch(() => {});
      }
    });

    await page.goto('https://www.tradingref.com/', { waitUntil: 'networkidle2', timeout: 25000 });

    const result = await page.evaluate(
      async (d: string, lang: string, paper: string, ed: string) => {
        try {
          // @ts-ignore
          if (typeof DataManager !== 'undefined' && typeof DataManager.loadEditions === 'function') {
            // @ts-ignore
            await DataManager.loadEditions(d);
            // @ts-ignore
            AppState.selectedDate = d;
            // @ts-ignore
            AppState.selectedLanguage = lang;
            // @ts-ignore
            AppState.selectedNewspaper = paper;
            // @ts-ignore
            AppState.selectedEdition = ed;
            // @ts-ignore
            const parsed = await DataManager.loadEditionData();
            if (parsed && parsed.prefix && parsed.suffix) {
              return { success: true, parsed };
            }
          }
        } catch (err: any) {
          return { success: false, error: err?.message || String(err) };
        }
        return null;
      },
      cleanDate,
      language,
      newspaper,
      edition
    );

    await page.close().catch(() => {});

    if (result?.success && result.parsed) {
      const { type, prefix, suffix } = result.parsed;
      const pages = suffix.split('m%').map((p: string) => p.trim()).filter(Boolean);
      if (pages.length > 0) {
        const raw_decoded = `${type}q!${prefix}q!${suffix}`;
        const entry: DecryptedEntry = {
          type: type as DecryptedEntry['type'],
          prefix,
          pages,
          pages_count: pages.length,
          raw_decoded,
        };
        persistToCache(entry);
        return entry;
      }
    } else if (result?.error) {
      console.warn(`[Live Scraper] DataManager error for ${newspaper} (${edition}):`, result.error);
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

