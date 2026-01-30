/**
 * Formatting Utilities
 */


import { PLATFORM, config } from '../config/index.js';
import { getMainBotUsername } from './runtime.js';

/**
 * Format currency amount with symbol
 */
export function formatCurrency(amount: number, currency: string): string {
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
  return `${formatted} ${currency.toUpperCase()}`;
}

/**
 * Format price for display (shorter format)
 */
export function formatPrice(amount: number, currency: string): string {
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${formatted} ${currency.toUpperCase()}`;
}

/**
 * Format duration in days
 */
export function formatDuration(days: number): string {
  if (days === 1) return '1 day';
  if (days === 7) return '1 week';
  if (days === 14) return '2 weeks';
  if (days === 30) return '1 month';
  if (days === 60) return '2 months';
  if (days === 90) return '3 months';
  if (days === 180) return '6 months';
  if (days === 365) return '1 year';
  return `${days} days`;
}

/**
 * Format plan for button display
 */
export function formatPlanButton(name: string, price: number, currency: string, days: number): string {
  return `${name} - ${formatPrice(price, currency)} / ${formatDuration(days)}`;
}

/**
 * Add platform footer to message with clickable link
 */
export function withFooter(message: string): string {
  // Create clickable footer that links to the platform
  return `${message}\n\n_Powered by_ [${config.PLATFORM_NAME}](https://t.me/${getMainBotUsername()})`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Escape markdown characters
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

/**
 * Format Telegram user mention
 */
export function formatUserMention(userId: bigint, name: string): string {
  return `[${escapeMarkdown(name)}](tg://user?id=${userId})`;
}

/**
 * Format subscriber count
 */
export function formatSubscriberCount(count: number): string {
  if (count === 0) return 'No subscribers';
  if (count === 1) return '1 subscriber';
  return `${count.toLocaleString()} subscribers`;
}
