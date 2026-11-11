import { describe, expect, it } from 'vitest';
import { InvalidConfigError, defaultConfig, resolveConfig, staffPinProblem } from '../src/index.js';

const problemsOf = (overrides: unknown): readonly string[] => {
  try {
    resolveConfig(overrides);
    return [];
  } catch (error) {
    if (error instanceof InvalidConfigError) return error.problems;
    throw error;
  }
};

describe('cashier PINs that HQ or a manager may set (staffPinProblem)', () => {
  it('takes 4 to 6 digits by default', () => {
    expect(defaultConfig.limits).toMatchObject({ staffPinMinDigits: 4, staffPinMaxDigits: 6 });
    for (const pin of ['2580', '73915', '402817']) expect(staffPinProblem(pin, defaultConfig), pin).toBeNull();
    for (const pin of ['', '258', '4028175', '12a4', ' 2580', '2580 ', '25.8', '٢٥٨٠']) {
      expect(staffPinProblem(pin, defaultConfig), JSON.stringify(pin)).toBe('pin_format');
    }
  });

  it('refuses PINs anyone would guess: one repeated digit, runs up or down', () => {
    for (const pin of ['0000', '1111', '999999', '1234', '0123', '456789', '4321', '9876', '6543']) {
      expect(staffPinProblem(pin, defaultConfig), pin).toBe('pin_too_simple');
    }
    for (const pin of ['1235', '0987', '1122', '2468', '1212', '9870']) expect(staffPinProblem(pin, defaultConfig), pin).toBeNull();
  });

  it('follows the config, which checks its numbers', () => {
    const long = resolveConfig({ limits: { staffPinMinDigits: 6, staffPinMaxDigits: 8 } });
    expect(staffPinProblem('2580', long)).toBe('pin_format');
    expect(staffPinProblem('25807391', long)).toBeNull();
    expect(problemsOf({ limits: { staffPinMinDigits: 3 } })).toEqual(['limits.staffPinMinDigits: must be between 4 and 12']);
    expect(problemsOf({ limits: { staffPinMinDigits: 7 } })).toEqual(['limits: staffPinMinDigits must not exceed staffPinMaxDigits']);
  });
});
