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
