import { type ProgramConfig, type TierId, defaultConfig } from './config.js';

/**
 * Per-brand program config: `brands.config` (jsonb) holds only the values HQ
 * changed; `resolveConfig` lays them over `defaultConfig` and validates the
 * result, so a typo or a bad number is caught before it reaches a balance.
 *
 * Merge rules: objects merge key by key; numbers and arrays replace the
 * default (so `tiers` and `expiryReminderDays` are always given in full).
 */

export class InvalidConfigError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`Invalid program config: ${problems.join('; ')}`);
    this.name = 'InvalidConfigError';
    this.problems = problems;
  }
}

type Obj = Record<string, unknown>;

function isPlainObject(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function merge(base: unknown, override: unknown): unknown {
  if (override === undefined) return base;
  if (isPlainObject(base) && isPlainObject(override)) {
    // Object.fromEntries defines own properties, so a "__proto__" key from
    // JSON stays a plain (unknown, rejected) key instead of a prototype.
    return Object.fromEntries([
      ...Object.entries(base).filter(([k]) => !Object.hasOwn(override, k)),
      ...Object.entries(override).map(([k, v]) => [k, merge(Object.hasOwn(base, k) ? base[k] : undefined, v)]),
    ]);
  }
  return override;
}

const tierIds: readonly TierId[] = ['classic', 'gold', 'club'];

class Checker {
  readonly problems: string[] = [];

  keys(value: Obj, allowed: readonly string[], path: string): void {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) this.problems.push(`${path}${key}: unknown setting`);
    }
  }

  int(value: unknown, path: string, min: number, max: number): value is number {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      this.problems.push(`${path}: must be an integer`);
      return false;
    }
    if (value < min || value > max) {
      this.problems.push(`${path}: must be between ${min} and ${max}`);
      return false;
    }
    return true;
  }

  object(value: unknown, path: string): value is Obj {
    if (!isPlainObject(value)) {
      this.problems.push(`${path}: must be an object`);
      return false;
    }
    return true;
  }
}

/** Every problem with a full config (empty array = valid). */
export function validateConfig(candidate: unknown): string[] {
  const c = new Checker();
  if (!c.object(candidate, 'config')) return c.problems;
  const cfg = candidate;
  c.keys(
    cfg,
    [
      'pointsPerEuro', 'tiers', 'tierWindowMonths', 'rewardPriceFactor', 'rewardRoundTo',
      'tierCostRoundTo', 'expiryMonths', 'expiryReminderDays', 'redemptionValidMinutes', 'welcome', 'minimumAge',
      'limits', 'qr',
    ],
    '',
  );
  c.int(cfg.pointsPerEuro, 'pointsPerEuro', 1, 1000);
  c.int(cfg.tierWindowMonths, 'tierWindowMonths', 1, 120);
  c.int(cfg.rewardPriceFactor, 'rewardPriceFactor', 1, 10_000);
  c.int(cfg.rewardRoundTo, 'rewardRoundTo', 1, 10_000);
  c.int(cfg.tierCostRoundTo, 'tierCostRoundTo', 1, 10_000);
  c.int(cfg.expiryMonths, 'expiryMonths', 1, 120);
  c.int(cfg.redemptionValidMinutes, 'redemptionValidMinutes', 1, 1440);
  c.int(cfg.minimumAge, 'minimumAge', 13, 21);
  if (c.object(cfg.welcome, 'welcome')) {
    c.keys(cfg.welcome, ['validDays'], 'welcome.');
    c.int(cfg.welcome.validDays, 'welcome.validDays', 1, 365);
  }

  if (!Array.isArray(cfg.expiryReminderDays)) {
    c.problems.push('expiryReminderDays: must be a list of days');
  } else {
    cfg.expiryReminderDays.forEach((d, i) => c.int(d, `expiryReminderDays[${i}]`, 1, 365));
  }

  if (!Array.isArray(cfg.tiers)) {
    c.problems.push('tiers: must be a list');
  } else {
    const seen = new Map<string, Obj>();
    cfg.tiers.forEach((t, i) => {
      const path = `tiers[${i}]`;
      if (!c.object(t, path)) return;
      c.keys(t, ['id', 'threshold', 'multiplierPct', 'rewardDiscountBp'], `${path}.`);
      if (typeof t.id !== 'string' || !(tierIds as readonly string[]).includes(t.id)) {
        c.problems.push(`${path}.id: must be one of ${tierIds.join(', ')}`);
      } else if (seen.has(t.id)) {
        c.problems.push(`${path}.id: "${t.id}" appears twice`);
      } else {
        seen.set(t.id, t);
      }
      c.int(t.threshold, `${path}.threshold`, 0, 10_000_000);
      c.int(t.multiplierPct, `${path}.multiplierPct`, 1, 1000);
      c.int(t.rewardDiscountBp, `${path}.rewardDiscountBp`, 0, 9999);
    });
    const missing = tierIds.filter((id) => !seen.has(id));
    if (missing.length) c.problems.push(`tiers: missing ${missing.join(', ')}`);
    else {
      // The database enum and reward limits ("Gold and above") assume
      // classic < gold < club, with classic open to everyone.
      const [classic, gold, club] = tierIds.map((id) => seen.get(id)!.threshold);
      if (typeof classic === 'number' && typeof gold === 'number' && typeof club === 'number') {
        if (classic !== 0) c.problems.push('tiers: classic threshold must be 0');
        if (!(classic < gold && gold < club)) {
          c.problems.push('tiers: thresholds must increase from classic to gold to club');
        }
      }
    }
  }

  if (c.object(cfg.limits, 'limits')) {
    const l = cfg.limits;
    c.keys(l, ['maxAmountCents', 'maxEarnsPerDay', 'minSecondsBetweenEarns', 'undoWindowMinutes', 'staffPinIdleMinutes'], 'limits.');
    c.int(l.maxAmountCents, 'limits.maxAmountCents', 1, 10_000_000);
    c.int(l.maxEarnsPerDay, 'limits.maxEarnsPerDay', 1, 1000);
    c.int(l.minSecondsBetweenEarns, 'limits.minSecondsBetweenEarns', 0, 86_400);
    c.int(l.undoWindowMinutes, 'limits.undoWindowMinutes', 0, 1440);
    c.int(l.staffPinIdleMinutes, 'limits.staffPinIdleMinutes', 1, 720);
  }

  if (c.object(cfg.qr, 'qr')) {
    const q = cfg.qr;
    c.keys(q, ['stepSeconds', 'acceptedDriftSteps', 'digits'], 'qr.');
    c.int(q.stepSeconds, 'qr.stepSeconds', 5, 3600);
    c.int(q.acceptedDriftSteps, 'qr.acceptedDriftSteps', 0, 10);
    // parseToken accepts 6–10 digit codes.
    c.int(q.digits, 'qr.digits', 6, 10);
  }
  return c.problems;
}

/**
 * The effective config of a brand: `overrides` (the `brands.config` jsonb,
 * null/undefined = none) merged over `base`. Throws InvalidConfigError when
 * the result is not a valid config. Returns a fresh object (never `base`).
 */
export function resolveConfig(overrides: unknown, base: ProgramConfig = defaultConfig): ProgramConfig {
  const given = overrides ?? {};
  if (!isPlainObject(given)) throw new InvalidConfigError(['overrides must be a JSON object']);
  const merged = merge(base, given);
  const problems = validateConfig(merged);
  if (problems.length) throw new InvalidConfigError(problems);
  // Plain JSON by construction; a deep copy keeps callers from mutating defaults.
  return JSON.parse(JSON.stringify(merged)) as ProgramConfig;
}
