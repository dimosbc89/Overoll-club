import { type Failure, fail } from '../result.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Thrown inside input parsing; turned into an `invalid_input` failure. */
export class InputError extends Error {}

export function uuid(value: unknown, name: string): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new InputError(`${name} must be a UUID`);
  return value.toLowerCase();
}

export function idempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 200) {
    throw new InputError('idempotencyKey must be a non-empty string of at most 200 characters');
  }
  return value;
}

export function text(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new InputError(`${name} must be a string of 1–${maxLength} characters`);
  }
  return value;
}

/** Trimmed text, or null when missing or blank. */
export function optionalText(value: unknown, name: string, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new InputError(`${name} must be a string`);
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > maxLength) throw new InputError(`${name} must be at most ${maxLength} characters`);
  return trimmed;
}

export function now(value: Date | undefined): Date {
  const date = value ?? new Date();
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new TypeError('now must be a valid Date');
  return date;
}

/** Run input parsing; an InputError becomes `invalid_input`, anything else is rethrown. */
export function parseInput<T>(parse: () => T): { input: T } | { failure: Failure<'invalid_input'> } {
  try {
    return { input: parse() };
  } catch (error) {
    if (error instanceof InputError) return { failure: fail('invalid_input', error.message) };
    throw error;
  }
}
