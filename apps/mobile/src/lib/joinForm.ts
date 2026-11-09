/**
 * Join and sign-in form rules (pure, unit-tested). Age and other numbers come
 * from the program config in packages/core.
 */
import { isOldEnoughToJoin, type ProgramConfig } from '@overoll/core';

import type { Locale } from '../i18n/messages';
import { BRAND_SLUG } from './env';

/** Same check as the server's `joinMember`. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.trim().length <= 254;
}

/** One-time codes are digits (Supabase: 6 by default, up to 10); spaces typed or pasted are dropped. */
export function normalizeOtp(input: string): string {
  return input.replace(/\D/g, '').slice(0, 10);
}

export function isValidOtp(code: string): boolean {
  return /^\d{6,10}$/.test(code);
}

/** Today's calendar date in Athens as YYYY-MM-DD (the program's calendar). */
export function athensToday(now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export type ProfileProblem = 'firstName' | 'age';

export interface ProfileInput {
  firstName: string;
  /** "I am 15 or older" (required at launch). */
  ageConfirmed: boolean;
  /** YYYY-MM-DD, from v1.1 (birthday field, hidden at launch): then core decides the age. */
  birthday?: string | null;
}

/** What still stops the member from continuing; empty = fine. */
export function profileProblems(input: ProfileInput, now: Date, config: ProgramConfig): ProfileProblem[] {
  const problems: ProfileProblem[] = [];
  const name = input.firstName.trim();
  if (!name || name.length > 50) problems.push('firstName');
  const oldEnough = input.birthday ? isOldEnoughToJoin(input.birthday, athensToday(now), config) : input.ageConfirmed;
  if (!oldEnough) problems.push('age');
  return problems;
}

export interface JoinDetails {
  firstName: string;
  email: string | null;
  locale: Locale;
  /** Only a store code that matched an active store (else the server says `store_not_found`). */
  storeCode: string | null;
  consents: { email: boolean; sms: boolean; push: boolean };
}

/** Body of `POST join` (packages/server joinMember); the idempotency key is added by the API client. */
export function joinBody(details: JoinDetails): Record<string, unknown> {
  return {
    brandSlug: BRAND_SLUG,
    firstName: details.firstName.trim(),
    email: details.email,
    locale: details.locale,
    joinedStoreCode: details.storeCode,
    consents: { ...details.consents },
  };
}

export type AuthProblem = 'tooMany' | 'network' | 'wrongCode' | 'invalidEmail' | 'unknown';

/** Supabase Auth errors → which copy-deck message to show. */
export function authProblem(error: { status?: number; code?: string; name?: string } | null | undefined): AuthProblem {
  if (!error) return 'unknown';
  const code = error.code ?? '';
  if (error.status === 429 || /rate_limit/.test(code)) return 'tooMany';
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'network';
  if (code === 'email_address_invalid' || code === 'validation_failed') return 'invalidEmail';
  if (code === 'otp_expired' || code === 'invalid_credentials' || error.status === 401 || error.status === 403) return 'wrongCode';
  return 'unknown';
}

/** Supabase lets a new code be sent once a minute. */
export const RESEND_SECONDS = 60;
