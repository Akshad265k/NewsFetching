import { format, parse, isValid, isBefore, isAfter, startOfDay } from 'date-fns';
import { EARLIEST_DATE, DATE_FORMAT } from '@/lib/constants';

export function formatDateForApi(date: Date): string {
  return format(date, DATE_FORMAT);
}

export function parseDateFromApi(dateStr: string): Date | null {
  const parsed = parse(dateStr, DATE_FORMAT, new Date());
  return isValid(parsed) ? parsed : null;
}

export function formatDateDisplay(date: Date): string {
  return format(date, 'MMMM d, yyyy');
}

export function formatDateShort(date: Date): string {
  return format(date, 'MMM d, yyyy');
}

export function isDateInRange(date: Date): boolean {
  const today = startOfDay(new Date());
  const earliest = startOfDay(EARLIEST_DATE);
  const check = startOfDay(date);
  
  return !isBefore(check, earliest) && !isAfter(check, today);
}

export function getDatePath(dateStr: string): string {
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);
  return `${year}/${month}/${day}`;
}
