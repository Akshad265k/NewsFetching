// ═══════════════════════════════════════════════════════════════════════════════
// THE CHRONICLE VAULT - Application Constants
// ═══════════════════════════════════════════════════════════════════════════════

export const APP_NAME = 'The Chronicle Vault';
export const APP_TAGLINE = 'Where yesterday\'s news becomes tomorrow\'s history';

export const TRADINGREF_API_BASE = 'https://data.tradingref.com';

export const EARLIEST_DATE = new Date(2025, 6, 29); // July 29, 2025
export const DATE_FORMAT = 'yyyyMMdd';

// Decryption cipher
export const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/';
export const REVERSED_ALPHABET = ALPHABET.split('').reverse().join('');

// Language display names with native script
export const LANGUAGE_DISPLAY_NAMES: Record<string, { name: string; native: string }> = {
  'bengali': { name: 'Bengali', native: 'বাংলা' },
  'hindi': { name: 'Hindi', native: 'हिन्दी' },
  'english': { name: 'English', native: 'English' },
  'gujarati': { name: 'Gujarati', native: 'ગુજરાતી' },
  'marathi': { name: 'Marathi', native: 'मराठी' },
  'tamil': { name: 'Tamil', native: 'தமிழ்' },
  'telugu': { name: 'Telugu', native: 'తెలుగు' },
  'kannada': { name: 'Kannada', native: 'ಕನ್ನಡ' },
  'malayalam': { name: 'Malayalam', native: 'മലയാളം' },
  'punjabi': { name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  'odia': { name: 'Odia', native: 'ଓଡ଼ିଆ' },
  'urdu': { name: 'Urdu', native: 'اردو' },
  'assamese': { name: 'Assamese', native: 'অসমীয়া' },
  'konkani': { name: 'Konkani', native: 'कोंकणी' },
};

// Request headers to mimic real browser
export const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive',
};

export const IMAGE_PROXY_BASE = 'https://images.weserv.nl';
