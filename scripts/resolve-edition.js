/**
 * Standalone Node script to resolve edition pages for a given newspaper edition.
 * Usage: node scripts/resolve-edition.js 20260917 english "Pune Mirror" "Pune Mirror"
 * Output: JSON { success: true, type, prefix, pages, totalPages }
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const puppeteer = require('puppeteer-core');

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

function getExecutablePath() {
  for (const p of CHROME_PATHS) {
    if (p && fs.existsSync(p)) return p;
  }
  throw new Error('Chrome/Chromium/Edge executable not found.');
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/';
const REVERSED_ALPHABET = ALPHABET.split('').reverse().join('');
const translationMap = {};
for (let i = 0; i < REVERSED_ALPHABET.length; i++) {
  translationMap[REVERSED_ALPHABET[i]] = ALPHABET[i];
}

function decryptString(obfuscated) {
  if (obfuscated.includes('q!')) return obfuscated;
  return obfuscated
    .split('')
    .map(char => translationMap[char] || char)
    .join('');
}

function readSnapshotFile(cleanDate) {
  const candidates = [
    path.join(process.cwd(), 'resources', 'tradingref-data', 'json-snapshots', `${cleanDate}.json`),
    path.join(os.tmpdir(), 'vartta-kosha-snapshots', `${cleanDate}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {}
    }
  }
  return null;
}

function writeSnapshotFile(cleanDate, data) {
  const rootDir = path.join(process.cwd(), 'resources', 'tradingref-data', 'json-snapshots');
  try {
    if (!fs.existsSync(rootDir)) fs.mkdirSync(rootDir, { recursive: true });
    fs.writeFileSync(path.join(rootDir, `${cleanDate}.json`), JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not write snapshot:', err.message);
  }
}

function normalizeKey(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function findKey(keys, query) {
  if (!keys || !query) return undefined;
  const direct = keys.find(k => k === query);
  if (direct) return direct;
  const nq = normalizeKey(query);
  return keys.find(k => normalizeKey(k) === nq || k.toLowerCase().includes(query.toLowerCase()) || query.toLowerCase().includes(k.toLowerCase()));
}

async function resolveEdition(dateStr, language, newspaper, edition) {
  const cleanDate = dateStr.replace(/-/g, '');
  const snapshot = readSnapshotFile(cleanDate);

  // Check if already in snapshot
  if (snapshot) {
    const langKey = findKey(Object.keys(snapshot), language);
    if (langKey && snapshot[langKey]) {
      const paperKey = findKey(Object.keys(snapshot[langKey]), newspaper);
      if (paperKey && snapshot[langKey][paperKey]) {
        const edKey = findKey(Object.keys(snapshot[langKey][paperKey]), edition);
        if (edKey) {
          const val = snapshot[langKey][paperKey][edKey];
          if (typeof val === 'string' && val.trim().length > 0) {
            const decoded = decryptString(val);
            const parts = decoded.split('q!');
            if (parts.length >= 3) {
              const pages = parts[2].split('m%').filter(p => p.trim());
              return {
                success: true,
                type: parts[0],
                prefix: parts[1],
                pages,
                totalPages: pages.length,
                newspaper: paperKey,
                edition: edKey,
                language: langKey,
                source: 'cached_snapshot'
              };
            }
          }
        }
      }
    }
  }

  // Need to scrape via headless browser
  const browser = await puppeteer.launch({
    executablePath: getExecutablePath(),
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--disable-gpu',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.goto('https://www.tradingref.com/', { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for Service Worker controller
    await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        try {
          await navigator.serviceWorker.ready;
          if (!navigator.serviceWorker.controller) {
            await new Promise((resolve) => {
              navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
              setTimeout(resolve, 3500);
            });
          }
        } catch {}
      }
    });

    const result = await page.evaluate(
      async (d, lang, paper, ed) => {
        try {
          for (let i = 0; i < 20; i++) {
            if (typeof DataManager !== 'undefined' && typeof DataManager.loadEditions === 'function') break;
            await new Promise(r => setTimeout(r, 250));
          }

          if (typeof DataManager !== 'undefined' && typeof DataManager.loadEditions === 'function') {
            await DataManager.loadEditions(d);
            AppState.selectedDate = d;
            AppState.selectedLanguage = lang;
            AppState.selectedNewspaper = paper;
            AppState.selectedEdition = ed;
            const parsed = await DataManager.loadEditionData();
            if (parsed && parsed.prefix && parsed.suffix) {
              return { success: true, parsed };
            }
          }
        } catch (err) {
          return { success: false, error: err?.message || String(err) };
        }
        return null;
      },
      cleanDate,
      language,
      newspaper,
      edition
    );

    if (result && result.success && result.parsed) {
      const { type, prefix, suffix } = result.parsed;
      const pages = suffix.split('m%').map(p => p.trim()).filter(Boolean);
      const raw_decoded = `${type}q!${prefix}q!${suffix}`;

      // Persist to local snapshot cache
      if (snapshot) {
        const langKey = findKey(Object.keys(snapshot), language) || language;
        if (!snapshot[langKey]) snapshot[langKey] = {};
        const paperKey = findKey(Object.keys(snapshot[langKey]), newspaper) || newspaper;
        if (!snapshot[langKey][paperKey]) snapshot[langKey][paperKey] = {};
        const edKey = findKey(Object.keys(snapshot[langKey][paperKey]), edition) || edition;
        snapshot[langKey][paperKey][edKey] = raw_decoded;
        writeSnapshotFile(cleanDate, snapshot);
      }

      return {
        success: true,
        type,
        prefix,
        pages,
        totalPages: pages.length,
        newspaper,
        edition,
        language,
        source: 'live_scraped'
      };
    }

    return {
      success: false,
      error: result?.error || 'Failed to resolve edition data'
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 4) {
    console.error(JSON.stringify({ success: false, error: 'Usage: node resolve-edition.js <date> <language> <newspaper> <edition>' }));
    process.exit(1);
  }

  const [date, language, newspaper, edition] = args;
  try {
    const res = await resolveEdition(date, language, newspaper, edition);
    console.log(JSON.stringify(res));
  } catch (err) {
    console.error(JSON.stringify({ success: false, error: err.message }));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { resolveEdition };
