/**
 * Till keypad: builds an integer-cents amount the way a card terminal does.
 * Typing 6, 4, 0 gives 640 (€6.40). Keys that would go over the maximum are ignored.
 */
export const digitKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'] as const;
export type DigitKey = (typeof digitKeys)[number];
export type KeypadKey = DigitKey | 'back' | 'clear';

export function pressKey(cents: number, key: KeypadKey, maxCents: number): number {
  if (key === 'clear') return 0;
  if (key === 'back') return Math.floor(cents / 10);
  const next = key === '00' ? cents * 100 : cents * 10 + Number(key);
  return next <= maxCents ? next : cents;
}

/** Cashier PIN pad: single digits only; the PIN stays a string (leading zeros count). */
export const pinDigitKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const;
export type PinKey = (typeof pinDigitKeys)[number] | 'back' | 'clear';

/** Longest PIN the pad accepts (the server checks the PIN itself). */
export const PIN_MAX_LENGTH = 12;

export function pressPinKey(pin: string, key: PinKey, maxLength = PIN_MAX_LENGTH): string {
  if (key === 'clear') return '';
  if (key === 'back') return pin.slice(0, -1);
  return pin.length < maxLength ? pin + key : pin;
}
