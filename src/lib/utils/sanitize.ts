export function sanitizeName(name: string): string {
  // Validate input
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return 'unknown';
  }
  
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .trim()
    .toLowerCase()
    .slice(0, 80) || 'unknown';
}

export function unsanitizeName(sanitized: string): string {
  // Validate input
  if (!sanitized || typeof sanitized !== 'string' || sanitized.trim().length === 0) {
    return '';
  }
  
  return sanitized
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function validateDateString(dateStr: string): boolean {
  if (!/^\d{8}$/.test(dateStr)) return false;
  
  const year = parseInt(dateStr.slice(0, 4));
  const month = parseInt(dateStr.slice(4, 6));
  const day = parseInt(dateStr.slice(6, 8));
  
  if (year < 2025 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return false;
  }
  
  return true;
}

export function validateLanguage(lang: string): boolean {
  return /^[a-z-]+$/.test(lang) && lang.length <= 50;
}

export function validateNewspaperName(name: string): boolean {
  return /^[a-z0-9-]+$/.test(name) && name.length <= 100;
}
