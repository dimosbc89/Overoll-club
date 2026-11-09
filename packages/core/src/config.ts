/**
 * Program configuration. Every business number lives here so HQ can change it
 * (stored per brand in the database as JSON) without touching app code.
 *
 * Money is always integer cents. Multipliers are integer percents and
 * discounts integer basis points (10 000 bp = 100%), so no floating point
 * ever touches a balance.
 */

export type TierId = 'classic' | 'gold' | 'club';

export interface TierRule {
  id: TierId;
  /** Points earned in the last 12 months needed to reach this tier. */
  threshold: number;
  /** Earn multiplier in percent: 100 = ×1.00, 125 = ×1.25. */
  multiplierPct: number;
  /** Discount on reward point costs in basis points: 2000 = 20% fewer points. */
  rewardDiscountBp: number;
}

export interface ProgramConfig {
  /** Points earned per €1 before the tier multiplier. */
  pointsPerEuro: number;
  /** Tiers ordered from lowest to highest threshold. */
  tiers: readonly TierRule[];
  /** Tiers count the points earned in this many months before now. */
  tierWindowMonths: number;
  /** Reward point cost = shelf price in € × this factor (before rounding). */
  rewardPriceFactor: number;
  /** Base reward costs are rounded to the nearest multiple of this. */
  rewardRoundTo: number;
  /** Tier-discounted reward costs are rounded to the nearest multiple of this. */
  tierCostRoundTo: number;
  /** Points expire this many months after the member's last purchase. */
  expiryMonths: number;
  /** Days before expiry when reminders are sent. */
  expiryReminderDays: readonly number[];
  /** Redemption codes stay valid for this many minutes. */
  redemptionValidMinutes: number;
  /** Welcome gift: a free reward unlocked by the first purchase, once per member; it never counts towards tiers. */
  welcome: {
    /** The gift expires this many days after it is unlocked. */
    validDays: number;
  };
  /** Youngest age allowed to join (GDPR digital consent age in Greece). */
  minimumAge: number;
  limits: {
    /** Largest receipt total accepted for one earn transaction, in cents. */
    maxAmountCents: number;
    /** Most earn transactions one member can make per calendar day (network-wide). */
    maxEarnsPerDay: number;
    /** Minimum seconds between two earn transactions for the same member (stops double scans). */
    minSecondsBetweenEarns: number;
    /** Staff can undo their own transaction for this many minutes. */
    undoWindowMinutes: number;
    /** A cashier enters their PIN once per shift; the console locks after this many idle minutes. */
    staffPinIdleMinutes: number;
  };
  qr: {
    /** Rotating member QR changes every this many seconds. */
    stepSeconds: number;
    /** How many steps before/after "now" are still accepted (clock differences). */
    acceptedDriftSteps: number;
    /** Number of digits in the rotating code. */
    digits: number;
  };
}

export const defaultConfig: ProgramConfig = {
  pointsPerEuro: 10,
  tiers: [
    { id: 'classic', threshold: 0, multiplierPct: 100, rewardDiscountBp: 0 },
    { id: 'gold', threshold: 1500, multiplierPct: 125, rewardDiscountBp: 2000 },
    { id: 'club', threshold: 4000, multiplierPct: 150, rewardDiscountBp: 3000 },
  ],
  tierWindowMonths: 12,
  rewardPriceFactor: 140,
  rewardRoundTo: 50,
  tierCostRoundTo: 10,
  expiryMonths: 12,
  expiryReminderDays: [30, 7],
  redemptionValidMinutes: 15,
  welcome: {
    validDays: 30,
  },
  minimumAge: 15,
  limits: {
    maxAmountCents: 8000,
    maxEarnsPerDay: 5,
    minSecondsBetweenEarns: 120,
    undoWindowMinutes: 10,
    staffPinIdleMinutes: 5,
  },
  qr: {
    stepSeconds: 30,
    acceptedDriftSteps: 1,
    digits: 8,
  },
};

/** Look up a tier rule; throws if the config is missing it (a config bug). */
export function tierRule(config: ProgramConfig, id: TierId): TierRule {
  const rule = config.tiers.find((t) => t.id === id);
  if (!rule) throw new Error(`Tier "${id}" is not configured`);
  return rule;
}
