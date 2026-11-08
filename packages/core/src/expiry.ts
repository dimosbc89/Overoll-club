import type { ProgramConfig } from './config.js';

/** Add calendar months in UTC, clamping to the month's last day (31 Jan + 1 → 28/29 Feb). */
export function addMonthsUtc(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const targetYear = y + Math.floor(m / 12);
  const targetMonth = ((m % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDay);
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      day,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/** When a member's points expire if they don't buy anything again. */
export function pointsExpireAt(lastPurchaseAt: Date, config: ProgramConfig): Date {
  return addMonthsUtc(lastPurchaseAt, config.expiryMonths);
}

export function arePointsExpired(lastPurchaseAt: Date, now: Date, config: ProgramConfig): boolean {
  return now.getTime() >= pointsExpireAt(lastPurchaseAt, config).getTime();
}

/** Whole days left until expiry (0 on the day itself, negative once expired). */
export function daysUntilExpiry(lastPurchaseAt: Date, now: Date, config: ProgramConfig): number {
  const ms = pointsExpireAt(lastPurchaseAt, config).getTime() - now.getTime();
  return Math.floor(ms / 86_400_000);
}

/** Which reminder (if any) is due today: 30 or 7 days before expiry with the default config. */
export function expiryReminderDue(
  lastPurchaseAt: Date,
  now: Date,
  config: ProgramConfig,
): number | null {
  const days = daysUntilExpiry(lastPurchaseAt, now, config);
  return config.expiryReminderDays.includes(days) ? days : null;
}
