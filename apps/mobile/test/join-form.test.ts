import { defaultConfig, resolveConfig } from '@grow-loyalty/core';
import { describe, expect, it } from 'vitest';

import { athensToday, authProblem, isValidEmail, isValidOtp, joinBody, normalizeOtp, profileProblems } from '../src/lib/joinForm';

const now = new Date('2026-11-09T10:00:00Z');

describe('join form', () => {
  it('needs a first name and the age confirmation', () => {
    expect(profileProblems({ firstName: 'Ελένη', ageConfirmed: true }, now, defaultConfig)).toEqual([]);
    expect(profileProblems({ firstName: '  ', ageConfirmed: false }, now, defaultConfig)).toEqual(['firstName', 'age']);
    expect(profileProblems({ firstName: 'x'.repeat(51), ageConfirmed: true }, now, defaultConfig)).toEqual(['firstName']);
  });

  it('decides with core isOldEnoughToJoin once a birthday is given (v1.1)', () => {
    expect(profileProblems({ firstName: 'Νίκος', ageConfirmed: false, birthday: '2011-11-09' }, now, defaultConfig)).toEqual([]);
    expect(profileProblems({ firstName: 'Νίκος', ageConfirmed: true, birthday: '2011-11-10' }, now, defaultConfig)).toEqual(['age']);
    const sixteen = resolveConfig({ minimumAge: 16 });
    expect(profileProblems({ firstName: 'Νίκος', ageConfirmed: false, birthday: '2011-11-09' }, now, sixteen)).toEqual(['age']);
  });

  it('uses the Athens calendar day', () => {
    expect(athensToday(new Date('2026-11-08T22:30:00Z'))).toBe('2026-11-09');
  });

  it('checks email like the server and cleans up typed codes', () => {
    expect(isValidEmail('eleni@example.com')).toBe(true);
    expect(isValidEmail(' eleni@example.com ')).toBe(true);
    expect(isValidEmail('eleni@example')).toBe(false);
    expect(isValidEmail('eleni example.com')).toBe(false);
    expect(normalizeOtp('123 456')).toBe('123456');
    expect(isValidOtp('123456')).toBe(true);
    expect(isValidOtp('12345')).toBe(false);
  });

  it('builds the join body with separate, optional consents', () => {
    expect(
      joinBody({
        firstName: ' Ελένη ',
        email: 'eleni@example.com',
        locale: 'el',
        storeCode: 'chalandri',
        consents: { email: true, sms: false, push: false },
      }),
    ).toEqual({
      brandSlug: 'overoll',
      firstName: 'Ελένη',
      email: 'eleni@example.com',
      locale: 'el',
      joinedStoreCode: 'chalandri',
      consents: { email: true, sms: false, push: false },
      confirmsMinimumAge: true,
    });
  });

  it('maps Supabase Auth errors to the copy-deck messages', () => {
    expect(authProblem({ status: 429, code: 'over_email_send_rate_limit' })).toBe('tooMany');
    expect(authProblem({ status: 403, code: 'otp_expired' })).toBe('wrongCode');
    expect(authProblem({ name: 'AuthRetryableFetchError', status: 0 })).toBe('network');
    expect(authProblem({ status: 400, code: 'email_address_invalid' })).toBe('invalidEmail');
    expect(authProblem({ status: 500 })).toBe('unknown');
  });
});
