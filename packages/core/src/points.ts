import { type ProgramConfig, type TierId, tierRule } from './config.js';

export type PurchaseError =
  | 'amount_not_integer'
  | 'amount_not_positive'
  | 'amount_over_limit';

/** Check a receipt total typed on the staff console. */
export function validatePurchaseAmount(
  amountCents: number,
  config: ProgramConfig,
): PurchaseError | null {
  if (!Number.isInteger(amountCents)) return 'amount_not_integer';
  if (amountCents <= 0) return 'amount_not_positive';
  if (amountCents > config.limits.maxAmountCents) return 'amount_over_limit';
  return null;
}

/**
 * Points for a purchase, rounded down.
 * points = floor(amountCents × pointsPerEuro × multiplierPct / 10 000)
 *
 * `bonusMultiplierPct` stacks on top of the tier (e.g. 200 for double-points
 * weeks): it multiplies the tier result, so a Gold member in a double week
 * earns ×2.5.
 */
export function pointsForPurchase(
  amountCents: number,
  tier: TierId,
  config: ProgramConfig,
  bonusMultiplierPct = 100,
): number {
  const error = validatePurchaseAmount(amountCents, config);
  if (error) throw new Error(`Invalid purchase amount: ${error}`);
  if (!Number.isInteger(bonusMultiplierPct) || bonusMultiplierPct < 100) {
    throw new Error('bonusMultiplierPct must be an integer ≥ 100');
  }
  const { multiplierPct } = tierRule(config, tier);
  // All integers: cents × points/€ × pct × pct, divided once at the end.
  return Math.floor(
    (amountCents * config.pointsPerEuro * multiplierPct * bonusMultiplierPct) /
      (100 * 100 * 100),
  );
}

export type EarnLimitError = 'too_soon_after_last_earn' | 'daily_earn_limit_reached';

/**
 * Check fraud limits before awarding points.
 * `recentEarnTimes` = this member's earn transactions (any store) in the
 * last 24 h or more; only the ones on `now`'s calendar day (in `timeZone`)
 * count towards the daily limit.
 */
export function checkEarnLimits(
  recentEarnTimes: readonly Date[],
  now: Date,
  config: ProgramConfig,
  timeZone = 'Europe/Athens',
): EarnLimitError | null {
  const latest = recentEarnTimes.reduce<number>(
    (max, d) => Math.max(max, d.getTime()),
    Number.NEGATIVE_INFINITY,
  );
  if (now.getTime() - latest < config.limits.minSecondsBetweenEarns * 1000) {
    return 'too_soon_after_last_earn';
  }
  const today = localDay(now, timeZone);
  const earnsToday = recentEarnTimes.filter((d) => localDay(d, timeZone) === today).length;
  if (earnsToday >= config.limits.maxEarnsPerDay) return 'daily_earn_limit_reached';
  return null;
}

/**
 * Earliest earn time that `checkEarnLimits` needs to see for `now`: a local
 * calendar day lasts at most 25 h (DST change), and the double-scan window
 * can be configured longer than that. Older earns can be left out of the query.
 */
export function earnLimitsLookbackStart(now: Date, config: ProgramConfig): Date {
  const ms = Math.max(26 * 3_600_000, config.limits.minSecondsBetweenEarns * 1000);
  return new Date(now.getTime() - ms);
}

/** Can staff still undo a transaction made at `createdAt`? */
export function canUndo(createdAt: Date, now: Date, config: ProgramConfig): boolean {
  const ageMs = now.getTime() - createdAt.getTime();
  return ageMs >= 0 && ageMs <= config.limits.undoWindowMinutes * 60_000;
}

/** YYYY-MM-DD of a moment in a given time zone. */
export function localDay(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
