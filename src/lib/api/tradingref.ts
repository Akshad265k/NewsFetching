// ═══════════════════════════════════════════════════════════════════════════════
// THE CHRONICLE VAULT - TradingRef API Client
// Handles live data fetching and decryption
// ═══════════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { 
  TRADINGREF_API_BASE, 
  ALPHABET, 
  REVERSED_ALPHABET,
  LANGUAGE_DISPLAY_NAMES,
} from '@/lib/constants';
import { sanitizeName } from '@/lib/utils/sanitize';
import { fetchLiveDateManifest, fetchLiveEditionPages } from '@/lib/scraper/live-scraper';
import type { 
  DecryptedEntry, 
  NewspaperData, 
  DecodedNewspaperData,
  Language,
  Newspaper,
  Edition 
} from '@/types';

// Create translation map for decryption
const translationMap: Record<string, string> = {};
for (let i = 0; i < REVERSED_ALPHABET.length; i++) {
  translationMap[REVERSED_ALPHABET[i]] = ALPHABET[i];
}

export function decrypt(obfuscated: string): string {
  return obfuscated
    .split('')
    .map(char => translationMap[char] || char)
    .join('');
}

export function decryptEntry(obfuscated: string): DecryptedEntry {
  const decoded = obfuscated.includes('q!') ? obfuscated : decrypt(obfuscated);
  const parts = decoded.split('q!');
  
  if (parts.length < 3) {
    return { type: '', prefix: '', pages: [], pages_count: 0 };
  }
  
  const pages = parts[2].split('m%').filter(p => p.trim());
  
  return {
    type: parts[0] as DecryptedEntry['type'],
    prefix: parts[1],
    pages,
    pages_count: pages.length,
    raw_decoded: decoded,
  };
}

export function joinUrl(prefix: string, page: string): string {
  if (!page) return prefix;
  if (page.startsWith('http')) return page;
  return `${prefix.replace(/\/$/, '')}/${page}`;
}

export function normalizeLookupKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function findMatchingKey(keys: string[], query: string): string | undefined {
  const direct = keys.find((key) => key === query);
  if (direct) return direct;

  const normalizedQuery = normalizeLookupKey(query);
  const sanitizedQuery = sanitizeName(query);

  return keys.find((key) => {
    const normalizedKey = normalizeLookupKey(key);
    return (
      normalizedKey === normalizedQuery ||
      normalizedKey === sanitizedQuery ||
      sanitizeName(key) === normalizedQuery ||
      sanitizeName(key) === sanitizedQuery
    );
  });
}

export async function fetchLiveData(dateStr: string): Promise<NewspaperData | null> {
  const cleanDate = dateStr.replace(/-/g, '');

  // 1. Check local snapshot archives first (fastest, 0ms)
  try {
    const snapshotsDir = path.join(process.cwd(), 'resources', 'tradingref-data', 'json-snapshots');
    const exactFile = path.join(snapshotsDir, `${cleanDate}.json`);
    
    if (fs.existsSync(exactFile)) {
      const content = fs.readFileSync(exactFile, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        return parsed as NewspaperData;
      }
    }
  } catch (snapshotErr) {
    console.error('Local snapshot read error:', snapshotErr);
  }

  // 2. Dynamically fetch manifest from TradingRef live site via headless scraper
  try {
    const liveScraped = await fetchLiveDateManifest(cleanDate);
    if (liveScraped && Object.keys(liveScraped).length > 0) {
      return liveScraped;
    }
  } catch (scrapeErr) {
    console.warn('Live manifest scrape error:', scrapeErr);
  }

  // 3. Fallback: try old remote endpoint if reachable
  try {
    const url = `${TRADINGREF_API_BASE}/${cleanDate}.json`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        return data as NewspaperData;
      }
    }
  } catch {}

  return null;
}

/**
 * Resolves full page URLs for an edition, dynamically scraping if needed
 */
export async function resolveEditionData(
  dateStr: string,
  language: string,
  newspaper: string,
  edition: string
): Promise<{
  entry: DecryptedEntry | null;
  originalLangKey: string;
  originalPaperKey: string;
  originalEditionKey: string;
} | null> {
  const liveData = await fetchLiveData(dateStr);
  if (!liveData) return null;

  const originalLangKey = findMatchingKey(Object.keys(liveData), language);
  if (!originalLangKey || !liveData[originalLangKey]) return null;

  const originalPaperKey = findMatchingKey(
    Object.keys(liveData[originalLangKey]),
    newspaper
  );
  if (!originalPaperKey || !liveData[originalLangKey][originalPaperKey]) return null;

  const originalEditionKey = findMatchingKey(
    Object.keys(liveData[originalLangKey][originalPaperKey]),
    edition
  );
  if (!originalEditionKey) return null;

  const obfuscated = liveData[originalLangKey][originalPaperKey][originalEditionKey];
  if (typeof obfuscated === 'string' && obfuscated.trim().length > 0) {
    const entry = decryptEntry(obfuscated);
    if (entry.pages.length > 0) {
      return { entry, originalLangKey, originalPaperKey, originalEditionKey };
    }
  }

  // Value is null or unpopulated - scrape on demand!
  const liveEntry = await fetchLiveEditionPages(
    dateStr,
    originalLangKey,
    originalPaperKey,
    originalEditionKey
  );

  return {
    entry: liveEntry,
    originalLangKey,
    originalPaperKey,
    originalEditionKey,
  };
}


export function getAvailableSnapshotDates(): string[] {
  try {
    const snapshotsDir = path.join(process.cwd(), 'resources', 'tradingref-data', 'json-snapshots');
    if (fs.existsSync(snapshotsDir)) {
      return fs.readdirSync(snapshotsDir)
        .filter(f => /^\d{8}\.json$/.test(f))
        .map(f => f.replace('.json', ''));
    }
  } catch {}
  return [];
}

export function decryptNewspaperData(data: NewspaperData): DecodedNewspaperData {
  const decoded: DecodedNewspaperData = {};
  
  for (const [language, newspapers] of Object.entries(data)) {
    if (typeof newspapers !== 'object') continue;
    decoded[language] = {};
    
    for (const [newspaper, editions] of Object.entries(newspapers)) {
      if (typeof editions !== 'object') continue;
      decoded[language][newspaper] = {};
      
      for (const [edition, obfuscated] of Object.entries(editions)) {
        if (typeof obfuscated !== 'string') continue;
        decoded[language][newspaper][edition] = decryptEntry(obfuscated);
      }
    }
  }
  
  return decoded;
}

export function extractLanguages(data: NewspaperData): Language[] {
  return Object.keys(data)
    .filter(lang => typeof data[lang] === 'object')
    .map(lang => {
      const sanitized = sanitizeName(lang);
      const displayInfo = LANGUAGE_DISPLAY_NAMES[sanitized] || { name: lang, native: lang };
      return {
        id: sanitized,
        name: displayInfo.name,
        nativeName: displayInfo.native,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function extractNewspapers(data: NewspaperData, language: string): Newspaper[] {
  const newspapers = data[language];
  if (!newspapers || typeof newspapers !== 'object') return [];
  
  return Object.keys(newspapers)
    .filter(paper => typeof newspapers[paper] === 'object')
    .map(paper => ({
      id: sanitizeName(paper),
      name: paper,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function extractEditions(
  data: NewspaperData, 
  language: string, 
  newspaper: string
): Edition[] {
  const newspapers = data[language];
  if (!newspapers) return [];
  
  const editions = newspapers[newspaper];
  if (!editions || typeof editions !== 'object') return [];
  
  return Object.entries(editions)
    .filter(([edition]) => Boolean(edition))
    .map(([edition, obfuscated]) => {
      const entry = typeof obfuscated === 'string' ? decryptEntry(obfuscated) : null;
      return {
        id: sanitizeName(edition),
        name: edition,
        pagesCount: entry ? entry.pages_count : undefined,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getEditionData(
  data: NewspaperData,
  language: string,
  newspaper: string,
  edition: string
): DecryptedEntry | null {
  const newspapers = data[language];
  if (!newspapers) return null;
  
  const editions = newspapers[newspaper];
  if (!editions) return null;
  
  const obfuscated = editions[edition];
  if (typeof obfuscated !== 'string') return null;
  
  return decryptEntry(obfuscated);
}
