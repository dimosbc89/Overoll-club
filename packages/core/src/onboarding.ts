import type { ProgramConfig } from './config.js';

const DAY_MS = 86_400_000;

/** When the welcome gift (unlocked by the first purchase) stops being redeemable. */
export function welcomeGiftExpiresAt(unlockedAt: Date, config: ProgramConfig): Date {
  return new Date(unlockedAt.getTime() + config.welcome.validDays * DAY_MS);
}

export function isWelcomeGiftValid(unlockedAt: Date, now: Date, config: ProgramConfig): boolean {
  return now.getTime() < welcomeGiftExpiresAt(unlockedAt, config).getTime();
}

/**
 * Age in whole years on `today`, both given as calendar dates "YYYY-MM-DD"
 * (no time zones involved). A birthday on 29 February counts from 1 March in
 * non-leap years.
 */
export function ageOn(birthDate: string, today: string): number {
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!b || !t) throw new Error('Dates must be YYYY-MM-DD');
  const [by, bm, bd] = [Number(b[1]), Number(b[2]), Number(b[3])];
  const [ty, tm, td] = [Number(t[1]), Number(t[2]), Number(t[3])];
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/** Can someone born on `birthDate` join on `today` ("YYYY-MM-DD" calendar dates)? */
export function isOldEnoughToJoin(birthDate: string, today: string, config: ProgramConfig): boolean {
  return ageOn(birthDate, today) >= config.minimumAge;
}

/** The staff console asks for the cashier's PIN again after this much idle time. */
export function staffPinSessionExpired(lastActivity: Date, now: Date, config: ProgramConfig): boolean {
  return now.getTime() - lastActivity.getTime() >= config.limits.staffPinIdleMinutes * 60_000;
}
