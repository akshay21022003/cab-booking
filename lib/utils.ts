import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Check if a booking can still be changed.
 * Rule: Changes allowed UP TO 24 hours before the booking time.
 */
export function canRequestChange(bookingDate: Date, time: string): boolean {
  const [hours, minutes] = time.split(':').map(Number);
  const bookingDateTime = new Date(bookingDate);
  bookingDateTime.setHours(hours, minutes, 0, 0);

  const cutoff = new Date(bookingDateTime.getTime() - 24 * 60 * 60 * 1000);
  return new Date() < cutoff;
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format time for display (24h → 12h)
 */
export function formatTime(time: string): string {
  if (!time) return '-';
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
}
